import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { ah, syncClaims, type Ctx } from '../controllers/support.ts';
import * as v from '../validators/index.ts';
import { EngineError } from '../domain/engine.ts';
import { User } from '../models/index.ts';
import { analyticsVolunteerRow } from './util.ts';

export function accountRoutes(ctx: Ctx): Router {
  const r = Router(), { store, engine } = ctx, admin = requireRole('admin');
  const otpLimit = rateLimit({ windowMs: 15 * 60_000, limit: 6, standardHeaders: true, legacyHeaders: false });
  const profile = (u: Awaited<ReturnType<typeof store.getUser>>) => u && { id: u.id, name: u.name, role: u.role, phoneVerified: u.phoneVerified, identityApproved: u.identityApproved, isAvailable: u.isAvailable, areaIds: u.areaIds };

  r.get('/api/me', requireAuth, ah(async (req, res) => { res.json({ auth: req.auth, profile: profile(await store.getUserByFirebaseUid(req.auth!.uid)) }); }));
  // Anyone with a Firebase account may APPLY to be a volunteer. No role claim is granted until an admin approves.
  r.post('/api/me/register-volunteer', requireAuth, ah(async (req, res) => {
    const b = v.registerVolunteer.parse(req.body);
    if (await store.getUserByFirebaseUid(req.auth!.uid)) throw new EngineError('CONFLICT', 'profile already exists');
    await User.create({ firebaseUid: req.auth!.uid, name: b.name, role: 'volunteer', areaIds: b.areaIds, identityApproved: false, phoneVerified: false, isAvailable: false });
    res.status(201).json(profile(await store.getUserByFirebaseUid(req.auth!.uid)));
  }));
  const me = async (uid: string) => { const u = await store.getUserByFirebaseUid(uid); if (!u) throw new EngineError('NOT_FOUND', 'no profile'); return u; };
  r.post('/api/me/phone/request-otp', requireAuth, otpLimit, ah(async (req, res) => { res.json(await engine.requestPhoneOtp((await me(req.auth!.uid)).id, v.requestOtp.parse(req.body).phone)); }));
  r.post('/api/me/phone/verify-otp', requireAuth, otpLimit, ah(async (req, res) => {
    const u = await engine.verifyPhoneOtp((await me(req.auth!.uid)).id, v.verifyOtp.parse(req.body).otp);
    if (u.identityApproved) await syncClaims(u.firebaseUid, { role: u.role, phoneVerified: true });
    res.json(profile(u));
  }));

  // Privileged role assignment: admins only. Claims and the profile are kept in sync here and nowhere else.
  r.post('/api/admin/users/:uid/role', requireAuth, admin, ah(async (req, res) => {
    const b = v.setRole.parse(req.body), uid = String(req.params.uid);
    let u = await store.getUserByFirebaseUid(uid);
    if (!u) { if (!b.name) throw new EngineError('INVALID_ASSIGNEE', 'name required for new profile'); await User.create({ firebaseUid: uid, name: b.name, role: b.role, identityApproved: true }); u = (await store.getUserByFirebaseUid(uid))!; }
    u.role = b.role; u.identityApproved = true; await store.saveUser(u);
    await syncClaims(uid, { role: b.role, phoneVerified: u.phoneVerified });
    await store.audit({ actorId: req.auth!.uid, actorRole: 'admin', action: 'user.role_assigned', entityType: 'user', entityId: u.id, metadata: { role: b.role } });
    res.json(profile(u));
  }));
  r.patch('/api/admin/volunteers/:id/approve', requireAuth, admin, ah(async (req, res) => {
    const u = await store.getUser(String(req.params.id)); if (!u || u.role !== 'volunteer') throw new EngineError('NOT_FOUND');
    const { approved } = v.approve.parse(req.body); u.identityApproved = approved; if (!approved) u.isAvailable = false; await store.saveUser(u);
    await syncClaims(u.firebaseUid, approved ? { role: 'volunteer', phoneVerified: u.phoneVerified } : null);
    await store.audit({ actorId: req.auth!.uid, actorRole: 'admin', action: approved ? 'volunteer.approved' : 'volunteer.revoked', entityType: 'user', entityId: u.id });
    res.json(profile(u));
  }));

  // Deletion request handled by an admin (e.g. a resident asked by email/in person). Residents can also text ERASE.
  r.post('/api/admin/erase', requireAuth, admin, ah(async (req, res) => { res.json(await engine.eraseResident(v.requestOtp.parse(req.body).phone)); }));

  const staffOrSelf = requireRole('volunteer', 'coordinator', 'admin');
  r.get('/api/volunteers', requireAuth, requireRole('coordinator', 'admin'), ah(async (_q, res) => {
    const [us, rs] = await Promise.all([store.listUsers('volunteer'), store.listReports()]);
    res.json(us.map((u) => analyticsVolunteerRow(u, rs)));
  }));
  r.get('/api/volunteers/:id', requireAuth, requireRole('coordinator', 'admin'), ah(async (req, res) => {
    const u = await store.getUser(String(req.params.id)); if (!u || u.role !== 'volunteer') throw new EngineError('NOT_FOUND');
    res.json(analyticsVolunteerRow(u, await store.listReports()));
  }));
  const selfOrAdmin = async (req: Parameters<typeof me>[0] extends string ? import('express').Request : never) => {
    const u = await store.getUser(String(req.params.id)); if (!u || u.role !== 'volunteer') throw new EngineError('NOT_FOUND');
    if (req.auth!.role === 'volunteer' && u.firebaseUid !== req.auth!.uid) throw new EngineError('FORBIDDEN');
    return u;
  };
  r.patch('/api/volunteers/:id/availability', requireAuth, staffOrSelf, ah(async (req, res) => {
    const u = await selfOrAdmin(req), { isAvailable } = v.availability.parse(req.body);
    if (isAvailable && (!u.identityApproved || !u.phoneVerified)) throw new EngineError('FORBIDDEN', 'must be admin-approved and phone-verified to be available');
    u.isAvailable = isAvailable; await store.saveUser(u); res.json({ isAvailable });
  }));
  r.get('/api/volunteers/:id/tasks', requireAuth, staffOrSelf, ah(async (req, res) => {
    const u = await selfOrAdmin(req);
    const { serializeReport } = await import('../controllers/support.ts');
    const rs = (await store.listReports({ assignedTo: u.id })).map(serializeReport);
    const history = (await store.listReports()).filter((x) => x.history.some((h) => h.actorId === u.id && h.action !== 'create')).map(serializeReport);
    res.json({ active: rs, history });
  }));
  return r;
}
