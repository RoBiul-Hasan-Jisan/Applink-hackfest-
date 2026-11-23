import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { ah, actorFor, serializeReport, storeEvidence, type Ctx } from '../controllers/support.ts';
import * as v from '../validators/index.ts';
import { EngineError } from '../domain/engine.ts';

export function reportRoutes(ctx: Ctx): Router {
  const r = Router(), { store, engine } = ctx, staff = requireRole('coordinator', 'admin');
  const publicLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  // Optional web reporting for residents (no account). Tight rate limit + the per-phone daily limit in the engine.
  r.post('/public/reports', publicLimit, ah(async (req, res) => {
    const { photoBase64, consentToStoreEvidence: _c, ...b } = v.createReport.parse(req.body); void _c;
    const evidence = photoBase64 ? [await storeEvidence(ctx, photoBase64, 'report', 'resident-web')] : [];
    const { report } = await engine.submitReport({ source: 'web', ...b, evidence, idempotencyKey: b.idempotencyKey ?? randomUUID() });
    res.status(201).json({ reportCode: report.reportCode, status: report.status, note: 'Your report is awaiting human review.' });
  }));
  r.get('/public/areas', ah(async (_q, res) => { res.json((await store.listAreas()).map((a) => ({ id: a.id, name: a.name, type: a.type }))); }));

  r.get('/api/reports', requireAuth, requireRole('volunteer', 'coordinator', 'admin'), ah(async (req, res) => {
    const q = v.listReports.parse(req.query);
    const mine = req.auth!.role === 'volunteer' ? (await store.getUserByFirebaseUid(req.auth!.uid))?.id ?? '__none__' : undefined;
    let rs = await store.listReports({ ...(q.areaId ? { areaId: q.areaId } : {}), ...(mine ? { assignedTo: mine } : {}), ...(q.status ? { status: q.status as never } : {}) });
    if (q.priority) rs = rs.filter((x) => x.priorityCategory === q.priority);
    if (q.q) { const s = q.q.toLowerCase(); rs = rs.filter((x) => x.reportCode.toLowerCase().includes(s) || (x.landmark ?? '').toLowerCase().includes(s)); }
    if (q.sort === 'oldest') rs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (q.sort === 'priority') rs.sort((a, b) => b.priorityScore - a.priorityScore);
    res.json(rs.map(serializeReport));
  }));
  r.post('/api/reports', requireAuth, staff, ah(async (req, res) => {
    const { photoBase64, consentToStoreEvidence: _c, ...b } = v.createReport.parse(req.body); void _c;
    const evidence = photoBase64 ? [await storeEvidence(ctx, photoBase64, 'report', req.auth!.uid)] : [];
    const out = await engine.submitReport({ source: 'web', ...b, evidence, idempotencyKey: b.idempotencyKey ?? randomUUID() });
    res.status(out.deduplicated ? 200 : 201).json(serializeReport(out.report));
  }));
  r.get('/api/reports/:id', requireAuth, requireRole('volunteer', 'coordinator', 'admin'), ah(async (req, res) => {
    const rep = await store.getReport(String(req.params.id)); if (!rep) throw new EngineError('NOT_FOUND');
    if (req.auth!.role === 'volunteer') { const u = await store.getUserByFirebaseUid(req.auth!.uid); if (rep.assignedTo !== u?.id) throw new EngineError('FORBIDDEN'); }
    const [area, assignee] = await Promise.all([store.getArea(rep.areaId), rep.assignedTo ? store.getUser(rep.assignedTo) : null]);
    res.json({ ...serializeReport(rep), area: area?.name, assignee: assignee ? { id: assignee.id, name: assignee.name, phoneVerified: assignee.phoneVerified } : null });
  }));

  const act = (path: string, action: Parameters<typeof engine.transition>[1], roles: ('volunteer' | 'coordinator' | 'admin')[], body: (b: unknown) => { reason?: string; notes?: string; assigneeId?: string }) =>
    r.patch(`/api/reports/:id/${path}`, requireAuth, requireRole(...roles), ah(async (req, res) => {
      const updated = await engine.transition(String(req.params.id), action, await actorFor(ctx, req), body(req.body ?? {}));
      res.json(serializeReport(updated));
    }));
  act('approve', 'approve', ['coordinator', 'admin'], (b) => v.approveBody.parse(b)); // human evidence review; the ONLY path to dispatch
  act('assign', 'assign', ['coordinator', 'admin'], (b) => v.assignBody.parse(b));
  act('accept', 'accept', ['volunteer'], (b) => v.notesBody.parse(b));
  act('decline', 'decline', ['volunteer'], (b) => v.reasonBody.parse(b));
  act('clean', 'clean', ['volunteer'], (b) => v.notesBody.parse(b));
  act('verify', 'verify', ['coordinator', 'admin'], (b) => v.notesBody.parse(b));
  act('reject', 'reject', ['coordinator', 'admin'], (b) => v.reasonBody.parse(b));
  act('reopen', 'reopen', ['coordinator', 'admin'], (b) => v.reasonBody.parse(b));
  r.get('/api/review-queue', requireAuth, staff, ah(async (_q, res) => {
    const rs = (await store.listReports({ status: 'NEW' })).sort((a, b) => b.priorityScore - a.priorityScore);
    res.json(rs.map(serializeReport));
  }));
  r.patch('/api/reports/:id/priority', requireAuth, staff, ah(async (req, res) => {
    res.json(serializeReport(await engine.overridePriority(String(req.params.id), await actorFor(ctx, req), v.overrideBody.parse(req.body))));
  }));
  return r;
}
