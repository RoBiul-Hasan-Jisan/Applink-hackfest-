// Orchestration: report intake, prioritization, assignment, workflow side-effects, inbound SMS, USSD, OTP, campaigns.
// Depends only on the Store and gateway interfaces, so the full report-to-resolution loop is testable in-memory.
import type { Store, ReportRec, UserRec, AreaRec, EvidenceRef, PriorityOverride } from './types.ts';
import { assessCare } from './care.ts';
import type { SmsGateway, OtpGateway } from '../integrations/applink/gateway.ts';
import { applyAction, isOpen, WorkflowError, type Action, type Actor, type ActionOptions } from './workflow.ts';
import { computePriority, DEFAULT_PRIORITY_CONFIG, type PriorityConfig, type ReportType } from './priority.ts';
import { findDuplicate, haversineMeters, DEFAULT_DUP, type GeoPoint } from './duplicate.ts';
import { selectVolunteer, isEligible, DEFAULT_MAX_ACTIVE_TASKS, type VolunteerCandidate } from './assignment.ts';
import { parseSms } from './sms-parser.ts';
import { render, type Lang, type TemplateName } from './templates.ts';
import { decryptPhone, encryptPhone, hashPhone, normalizeBdPhone, last4 } from './phone-crypto.ts';
import { randomUUID } from 'node:crypto';
import type { EvidenceStorage } from '../integrations/storage.ts';
import { step as ussdStep, type UssdDeps, type UssdResult } from './ussd-machine.ts';

export type EngineErrorCode = 'NOT_FOUND' | 'AREA_NOT_FOUND' | 'DAILY_LIMIT' | 'CONFLICT' | 'INVALID_PHONE' | 'INVALID_ASSIGNEE' | 'OTP_FAILED' | 'OTP_NOT_REQUESTED' | 'PHONE_IN_USE' | 'FORBIDDEN' | 'DUPLICATE_UNRESOLVED' | 'EVIDENCE_REJECTED';
export class EngineError extends Error {
  code: EngineErrorCode;
  constructor(code: EngineErrorCode, message?: string) { super(message ?? code); this.name = 'EngineError'; this.code = code; }
}
export interface EngineConfig {
  phoneHashSecret: string; phoneEncryptionKey: string; dailyReportLimit: number; priority: PriorityConfig;
  maxActiveTasks: number; dup: typeof DEFAULT_DUP; smsLanguage: Lang; reminderAfterHours: number;
  nearbyRadiusMeters: number; maxCampaignRecipients: number; maxOtpAttempts: number; contactRetentionDays: number;
}
export const defaultEngineConfig = (secrets: Pick<EngineConfig, 'phoneHashSecret' | 'phoneEncryptionKey'>, over: Partial<EngineConfig> = {}): EngineConfig => ({
  ...secrets, dailyReportLimit: 5, priority: DEFAULT_PRIORITY_CONFIG, maxActiveTasks: DEFAULT_MAX_ACTIVE_TASKS, dup: DEFAULT_DUP,
  smsLanguage: 'en', reminderAfterHours: 2, nearbyRadiusMeters: 1000, maxCampaignRecipients: 200, maxOtpAttempts: 5, contactRetentionDays: 30, ...over,
});
export interface SubmitInput {
  source: 'ussd' | 'sms' | 'web'; phone: string; type: ReportType; areaId: string; landmark?: string;
  location?: GeoPoint | null; consentToUpdates: boolean; idempotencyKey: string; isSynthetic?: boolean; evidence?: EvidenceRef[];
}
const SYSTEM: Actor = { id: 'system', role: 'system' };
const TYPE_LABEL: Record<ReportType, string> = { standing_water: 'standing water', hotspot: 'mosquito hotspot', drainage: 'blocked drain', other: 'other issue' };
const TIPS = ['Empty containers holding water weekly.', 'Cover water tanks tightly.', 'Clear blocked drains.'];

export function createEngine(deps: { store: Store; sms: SmsGateway; otp?: OtpGateway; storage?: EvidenceStorage; cfg: EngineConfig; clock?: () => Date }) {
  const { store, sms, cfg } = deps;
  const now = deps.clock ?? (() => new Date());
  const hash = (p: string) => hashPhone(p, cfg.phoneHashSecret);

  async function sendTo(phone: string, template: TemplateName, vars: Record<string, string | number>, key: string, relatedReportId: string | null = null): Promise<boolean> {
    const body = render(template, cfg.smsLanguage, vars);
    const base = { toHash: hash(phone), template, body, language: cfg.smsLanguage, relatedReportId, createdAt: now(), deliveryStatus: null as string | null };
    try {
      const r = await sms.send({ to: phone, body, idempotencyKey: key });
      await store.insertMessage({ ...base, status: 'sent', providerMessageId: r.providerMessageId, providerRequestId: r.providerRequestId });
      return true;
    } catch {
      await store.insertMessage({ ...base, status: 'failed', providerMessageId: null, providerRequestId: null });
      return false; // notification failure never blocks the workflow
    }
  }
  const notifyReporter = async (r: ReportRec, t: TemplateName, vars: Record<string, string | number>, key: string) =>
    r.consentToUpdates && r.reporterPhoneEncrypted ? sendTo(decryptPhone(r.reporterPhoneEncrypted, cfg.phoneEncryptionKey), t, { code: r.reportCode, ...vars }, `${t}:${r.id}:${key}`, r.id) : false;
  const notifyUser = async (u: UserRec, t: TemplateName, vars: Record<string, string | number>, key: string, r: ReportRec) =>
    u.phoneEncrypted ? sendTo(decryptPhone(u.phoneEncrypted, cfg.phoneEncryptionKey), t, vars, `${t}:${r.id}:${u.id}:${key}`, r.id) : false;

  async function priorityFor(r: Pick<ReportRec, 'areaId' | 'type' | 'location' | 'createdAt'> & { id?: string }, reopened = false) {
    const risk = await store.latestRisk(r.areaId);
    const open = (await store.listReports({ areaId: r.areaId })).filter((x) => x.id !== r.id && !x.duplicateOf && isOpen(x.status) &&
      (!r.location || !x.location || haversineMeters(r.location, x.location) <= cfg.nearbyRadiusMeters));
    // unvalidated / rules-based estimates never drive priority
    const p = computePriority({ areaRiskScore: risk && risk.evaluationStatus === 'validated' ? risk.score : null, nearbyOpenCount: open.length, ageHours: (now().getTime() - r.createdAt.getTime()) / 3600_000, type: r.type, reopened }, cfg.priority);
    return { p, risk };
  }

  async function volunteerCandidates(excludeIds: string[]): Promise<VolunteerCandidate[]> {
    const [users, reports] = await Promise.all([store.listUsers('volunteer'), store.listReports()]);
    return users.filter((u) => !excludeIds.includes(u.id)).map((u) => ({
      id: u.id, role: u.role, identityApproved: u.identityApproved, phoneVerified: u.phoneVerified, isAvailable: u.isAvailable,
      areaIds: u.areaIds, location: u.location, activeTasks: reports.filter((r) => r.assignedTo === u.id && (r.status === 'ASSIGNED' || r.status === 'ACCEPTED')).length,
    }));
  }
  async function tryAutoAssign(r: ReportRec, exclude: string[] = []): Promise<ReportRec> {
    const sel = selectVolunteer({ areaId: r.areaId, location: r.location }, await volunteerCandidates(exclude), cfg.maxActiveTasks);
    if (!sel.volunteerId) {
      await store.audit({ actorId: 'system', actorRole: 'system', action: 'report.queued_for_coordinator', entityType: 'report', entityId: r.id, metadata: { reason: sel.reason } });
      return r;
    }
    return transition(r.id, 'assign', SYSTEM, { assigneeId: sel.volunteerId, notes: `auto: ${sel.reason}` });
  }

  async function submitReport(i: SubmitInput): Promise<{ report: ReportRec; deduplicated: boolean }> {
    const existing = await store.getReportByKey(i.idempotencyKey);
    if (existing) return { report: existing, deduplicated: true }; // gateway retry / double submit
    const area = await store.getArea(i.areaId); if (!area) throw new EngineError('AREA_NOT_FOUND');
    const phone = normalizeBdPhone(i.phone); if (!phone) throw new EngineError('INVALID_PHONE');
    const h = hash(phone), t = now();
    if ((await store.countReportsSince(h, new Date(t.getTime() - 24 * 3600_000))) >= cfg.dailyReportLimit) throw new EngineError('DAILY_LIMIT');

    const prior = (await store.listReports({ areaId: i.areaId })).map((r) => ({ id: r.id, areaId: r.areaId, type: r.type, createdAt: r.createdAt, location: r.location, status: r.status, duplicateOf: r.duplicateOf }));
    const dup = findDuplicate({ areaId: i.areaId, type: i.type, createdAt: t, location: i.location ?? null }, prior, cfg.dup);
    const draft = { areaId: i.areaId, type: i.type, location: i.location ?? null, createdAt: t };
    const { p, risk } = await priorityFor(draft);
    const reasons = [...p.reasons];
    if (dup) reasons.push(`Possible duplicate of an existing report (${dup.basis === 'distance' ? `within ${dup.distanceMeters}m` : 'same area, type and 24h window'}); reviewer must confirm or merge`);

    const eligible = (await volunteerCandidates([])).filter((v) => isEligible(v, i.areaId)).length;
    const care = assessCare({ hasPhoto: (i.evidence ?? []).length > 0, hasLocation: !!i.location, hasLandmark: !!i.landmark, duplicateSuggested: !!dup, eligibleVolunteers: eligible });
    let rec: ReportRec;
    try {
      rec = await store.insertReport({
        reportCode: await store.nextReportCode(t.getUTCFullYear()), idempotencyKey: i.idempotencyKey, reporterPhoneHash: h, reporterPhoneLast4: last4(phone),
        reporterPhoneEncrypted: i.consentToUpdates ? encryptPhone(phone, cfg.phoneEncryptionKey) : null, type: i.type, areaId: i.areaId,
        location: i.location ?? null, landmark: i.landmark ?? null, status: 'NEW', priorityScore: p.score, priorityCategory: p.category, priorityReasons: reasons,
        riskLevelAtCreation: risk?.level ?? null, assignedTo: null, duplicateOf: dup?.originalId ?? null,
        history: [{ actorId: i.source, actorRole: 'resident', at: t, from: 'NEW', to: 'NEW', action: 'create', notes: `via ${i.source}` }],
        residentConfirmed: null, source: i.source, consentToUpdates: i.consentToUpdates, reminderSentAt: null, evidenceNote: null, evidence: i.evidence ?? [], ...care, priorityRuleVersion: p.ruleVersion, priorityOverride: null, isSynthetic: !!i.isSynthetic, createdAt: t,
      });
    } catch (e) {
      if ((e as Error).message.includes('DUPLICATE_KEY') || (e as { code?: number }).code === 11000) { // lost an idempotency race
        const again = await store.getReportByKey(i.idempotencyKey); if (again) return { report: again, deduplicated: true };
      }
      throw e;
    }
    await store.audit({ actorId: i.source, actorRole: 'resident', action: 'report.created', entityType: 'report', entityId: rec.id, metadata: { code: rec.reportCode, duplicateOf: rec.duplicateOf } });
    await notifyReporter(rec, dup ? 'report_linked' : 'report_received', {}, 'create');
    return { report: rec, deduplicated: false }; // NO dispatch here: a human reviewer must approve first
  }

  async function transition(reportId: string, action: Action, actor: Actor, opts: ActionOptions = {}): Promise<ReportRec> {
    const r = await store.getReport(reportId); if (!r) throw new EngineError('NOT_FOUND');
    let assignee: UserRec | null = null;
    if (action === 'assign' && opts.assigneeId) {
      assignee = await store.getUser(opts.assigneeId);
      if (!assignee || assignee.role !== 'volunteer' || !assignee.identityApproved || !assignee.phoneVerified) throw new EngineError('INVALID_ASSIGNEE', 'assignee must be an approved, phone-verified volunteer');
    }
    if (action === 'approve' && r.duplicateOf) {
      if (!opts.notDuplicate) throw new EngineError('DUPLICATE_UNRESOLVED', 'possible duplicate: confirm it is not a duplicate, or reject/merge it');
      r.duplicateOf = null;
    }
    const prev = r.status;
    const res = applyAction(r, action, actor, opts, now());
    r.status = res.status; r.assignedTo = res.assignedTo; r.history.push(res.entry);
    if (action === 'clean' && opts.notes) r.evidenceNote = opts.notes;
    if (action === 'reopen') {
      r.residentConfirmed = actor.role === 'resident' ? false : r.residentConfirmed;
      const { p } = await priorityFor(r, true); r.priorityScore = p.score; r.priorityCategory = p.category; r.priorityReasons = p.reasons;
    }
    if (!(await store.saveReport(r, prev))) throw new EngineError('CONFLICT', 'report changed concurrently; retry');
    await store.audit({ actorId: actor.id, actorRole: actor.role, action: `report.${action}`, entityType: 'report', entityId: r.id, metadata: { from: prev, to: r.status, reason: opts.reason } });

    if (action === 'assign' && assignee) {
      const area = await store.getArea(r.areaId);
      await notifyUser(assignee, 'volunteer_assigned', { code: r.reportCode, type: TYPE_LABEL[r.type], area: area?.name ?? '', landmark: r.landmark ? `Near ${r.landmark}. ` : '' }, 'assign', r);
    }
    if (action === 'approve') return tryAutoAssign((await store.getReport(r.id))!); // dispatch only after human approval
    if (action === 'decline') return tryAutoAssign(r, [actor.id]);
    if (action === 'verify') await notifyReporter(r, 'resolution_request', {}, 'verify');
    if (action === 'reopen') { await notifyReporter(r, 'reopened_ack', {}, `reopen:${r.history.length}`); return tryAutoAssign(r); }
    return (await store.getReport(r.id))!;
  }

  async function actorForUser(u: UserRec): Promise<Actor> { return { id: u.id, role: u.role === 'volunteer' ? 'volunteer' : u.role, phoneVerified: u.phoneVerified, identityApproved: u.identityApproved }; }

  async function sendReminders(): Promise<number> {
    const cutoff = now().getTime() - cfg.reminderAfterHours * 3600_000; let n = 0;
    for (const r of await store.listReports({ status: 'ASSIGNED' })) {
      if (r.reminderSentAt || !r.assignedTo || r.updatedAt.getTime() > cutoff) continue;
      const u = await store.getUser(r.assignedTo); if (!u) continue;
      if (await notifyUser(u, 'volunteer_reminder', { code: r.reportCode }, 'reminder', r)) { r.reminderSentAt = now(); await store.saveReport(r, 'ASSIGNED'); n++; }
    }
    return n;
  }

  async function resolveArea(rest: string): Promise<{ area: AreaRec; landmark: string } | null> {
    const low = rest.toLowerCase();
    const areas = (await store.listAreas()).sort((a, b) => b.name.length - a.name.length);
    for (const a of areas) {
      const n = a.name.toLowerCase();
      if (low === n || low.startsWith(n + ' ')) return { area: a, landmark: rest.slice(n.length).trim().replace(/^(near|at)\s+/i, '') };
    }
    return null;
  }

  async function handleInboundSms(m: { id: string; from: string; text: string }): Promise<{ handled: boolean; kind: string }> {
    if (!(await store.markProcessed(`sms-in:${m.id}`))) return { handled: false, kind: 'DUPLICATE_DELIVERY' };
    const phone = normalizeBdPhone(m.from); if (!phone) return { handled: false, kind: 'INVALID_SENDER' };
    const h = hash(phone), parsed = parseSms(m.text, now().getUTCFullYear()), key = `reply:${m.id}`;
    const reply = (t: TemplateName, v: Record<string, string | number> = {}) => sendTo(phone, t, v, key);
    const user = await store.getUserByPhoneHash(h);

    switch (parsed.kind) {
      case 'ERASE': {
        if (user) { await reply('not_recognised'); return { handled: true, kind: 'ERASE_REFUSED_STAFF' }; } // staff profiles go through an admin
        await eraseResident(phone);
        try { await sms.send({ to: phone, body: render('erased', cfg.smsLanguage), idempotencyKey: key }); } catch { /* confirmation is best effort and deliberately not logged */ }
        return { handled: true, kind: 'ERASE' };
      }
      case 'OPT_OUT': await store.optOutPhone(h); await reply('opted_out'); return { handled: true, kind: 'OPT_OUT' };
      case 'REPORT': {
        const hit = await resolveArea(parsed.rest);
        if (!hit) { await reply('area_not_found'); return { handled: true, kind: 'AREA_NOT_FOUND' }; }
        try {
          // SMS-originated reports reply to the sender, so updates are treated as consented; STOP withdraws it.
          const { report } = await submitReport({ source: 'sms', phone, type: parsed.reportType, areaId: hit.area.id, ...(hit.landmark ? { landmark: hit.landmark.slice(0, 60) } : {}), consentToUpdates: true, idempotencyKey: `sms:${m.id}` });
          return { handled: true, kind: `REPORT:${report.reportCode}` };
        } catch (e) { if (e instanceof EngineError && e.code === 'DAILY_LIMIT') { await reply('daily_limit'); return { handled: true, kind: 'DAILY_LIMIT' }; } throw e; }
      }
      case 'ACCEPT': case 'DONE': {
        const r = await store.getReportByCode(parsed.code);
        if (!user || user.role !== 'volunteer' || !r) { await reply('not_recognised'); return { handled: true, kind: 'REJECTED_IDENTITY' }; }
        try { await transition(r.id, parsed.kind === 'ACCEPT' ? 'accept' : 'clean', await actorForUser(user), parsed.kind === 'DONE' ? { notes: 'completed via SMS' } : {}); return { handled: true, kind: parsed.kind }; }
        catch (e) { if (e instanceof WorkflowError || e instanceof EngineError) { await reply('not_recognised'); return { handled: true, kind: `REJECTED:${e.code}` }; } throw e; }
      }
      case 'STATUS': {
        const r = await store.getReportByCode(parsed.code);
        const allowed = r && (r.reporterPhoneHash === h || r.assignedTo === user?.id || user?.role === 'coordinator' || user?.role === 'admin');
        if (!r || !allowed) { await reply('not_recognised'); return { handled: true, kind: 'REJECTED_IDENTITY' }; }
        await reply('status', { code: r.reportCode, status: r.status }); return { handled: true, kind: 'STATUS' };
      }
      case 'CONFIRM': {
        const mine = (await store.listReports({ reporterPhoneHash: h })).filter((r) => r.residentConfirmed === null && (r.status === 'VERIFIED' || r.status === 'CLEANED'));
        const r = parsed.code ? mine.find((x) => x.reportCode === parsed.code) : mine[0];
        if (!r) { await reply('not_recognised'); return { handled: true, kind: 'NO_PENDING_CONFIRMATION' }; }
        if (parsed.fixed) {
          r.residentConfirmed = true; await store.saveReport(r, r.status);
          await store.audit({ actorId: 'resident', actorRole: 'resident', action: 'report.resident_confirmed', entityType: 'report', entityId: r.id });
          await reply('confirmed_thanks', { code: r.reportCode }); return { handled: true, kind: 'CONFIRM_FIXED' };
        }
        await transition(r.id, 'reopen', { id: 'resident', role: 'resident', phoneHash: h }, { reason: 'resident reported the problem still exists (SMS reply 2)' });
        return { handled: true, kind: 'CONFIRM_REOPENED' };
      }
      default: {
        if (!(await store.hasRecentMessage(h, 'help', new Date(now().getTime() - 24 * 3600_000)))) await reply('help'); // avoid paying to answer spam repeatedly
        return { handled: true, kind: 'UNKNOWN' };
      }
    }
  }
  /** Poll the provider's inbound queue (documented /sms/receive is retrieval, not a webhook). */
  async function pollInboundSms(): Promise<number> { let n = 0; for (const m of await sms.fetchInbound()) { const r = await handleInboundSms(m); if (r.handled) n++; } return n; }

  async function ussd(req: { sessionId: string; phone: string; text: string }): Promise<UssdResult> {
    const phone = normalizeBdPhone(req.phone); if (!phone) return { text: 'Invalid number.', continueSession: false, session: null };
    const h = hash(phone);
    const d: UssdDeps = {
      listAreas: async () => (await store.listAreas()).map((a) => ({ id: a.id, name: a.name })),
      getRisk: async (areaId) => { const r = await store.latestRisk(areaId); return r ? { level: r.level, score: r.score } : null; },
      getReportStatus: async (code, ph) => { const r = await store.getReportByCode(code); return r && r.reporterPhoneHash === ph ? { status: r.status } : null; },
      submitReport: async (x) => ({ code: (await submitReport({ source: 'ussd', phone, type: x.type, areaId: x.areaId, ...(x.landmark ? { landmark: x.landmark } : {}), consentToUpdates: x.consentToUpdates, idempotencyKey: x.idempotencyKey })).report.reportCode }),
    };
    try {
      const res = await ussdStep(await store.getSession(req.sessionId), req.text, d, { sessionId: req.sessionId, phoneHash: h, now: now().getTime() });
      if (res.session) await store.saveSession(res.session); else await store.deleteSession(req.sessionId);
      return res;
    } catch (e) {
      await store.deleteSession(req.sessionId);
      return { text: e instanceof EngineError && e.code === 'DAILY_LIMIT' ? 'Daily report limit reached. Try again tomorrow.' : 'Service error. Please try again later.', continueSession: false, session: null };
    }
  }

  async function sendAreaAlert(a: { areaId: string; actor: Actor; tip?: string }) {
    if (a.actor.role !== 'coordinator' && a.actor.role !== 'admin') throw new EngineError('FORBIDDEN');
    const area = await store.getArea(a.areaId); if (!area) throw new EngineError('AREA_NOT_FOUND');
    const risk = await store.latestRisk(a.areaId);
    const contacts = await store.optedInContacts(a.areaId); let sent = 0, skipped = 0;
    const since = new Date(now().getTime() - 24 * 3600_000), tip = a.tip ?? TIPS[now().getUTCDate() % TIPS.length]!;
    for (const c of contacts.slice(0, cfg.maxCampaignRecipients)) {
      if (await store.hasRecentMessage(c.phoneHash, 'area_alert', since)) { skipped++; continue; } // no repeated messages
      const ok = await sendTo(decryptPhone(c.phoneEncrypted, cfg.phoneEncryptionKey), 'area_alert', { area: area.name, level: risk?.level ?? 'UNKNOWN', tip }, `alert:${a.areaId}:${now().toISOString().slice(0, 10)}:${c.phoneHash}`);
      ok ? sent++ : skipped++;
    }
    skipped += Math.max(0, contacts.length - cfg.maxCampaignRecipients);
    const c = await store.insertCampaign({ areaId: a.areaId, message: render('area_alert', cfg.smsLanguage, { area: area.name, level: risk?.level ?? 'UNKNOWN', tip }), createdBy: a.actor.id, recipients: sent, skipped, createdAt: now() });
    await store.audit({ actorId: a.actor.id, actorRole: a.actor.role, action: 'campaign.alert', entityType: 'campaign', entityId: c.id, metadata: { sent, skipped } });
    return c;
  }

  async function requestPhoneOtp(userId: string, rawPhone: string) {
    if (!deps.otp) throw new EngineError('OTP_FAILED', 'OTP gateway unavailable');
    const phone = normalizeBdPhone(rawPhone); if (!phone) throw new EngineError('INVALID_PHONE');
    const u = await store.getUser(userId); if (!u) throw new EngineError('NOT_FOUND');
    const other = await store.getUserByPhoneHash(hash(phone)); if (other && other.id !== u.id) throw new EngineError('PHONE_IN_USE');
    const r = await deps.otp.request(phone);
    u.otpRef = r.referenceNo; u.otpExpiresAt = r.expiresAt; u.otpAttempts = 0; u.phoneEncrypted = encryptPhone(phone, cfg.phoneEncryptionKey); u.phoneHash = hash(phone); u.phoneVerified = false;
    await store.saveUser(u);
    return { expiresAt: r.expiresAt };
  }
  /** Marks the phone verified ONLY after an explicit provider-confirmed success. Never trusts request success. */
  async function verifyPhoneOtp(userId: string, otp: string): Promise<UserRec> {
    if (!deps.otp) throw new EngineError('OTP_FAILED', 'OTP gateway unavailable');
    const u = await store.getUser(userId); if (!u) throw new EngineError('NOT_FOUND');
    if (!u.otpRef || !u.otpExpiresAt || u.otpExpiresAt < now()) throw new EngineError('OTP_NOT_REQUESTED', 'request a new OTP');
    if (u.otpAttempts >= cfg.maxOtpAttempts) throw new EngineError('OTP_FAILED', 'too many attempts; request a new OTP');
    u.otpAttempts++;
    const ok = await deps.otp.verify(u.otpRef, otp);
    if (!ok) { await store.saveUser(u); throw new EngineError('OTP_FAILED', 'incorrect or expired OTP'); }
    u.phoneVerified = true; u.otpRef = null; u.otpExpiresAt = null; u.otpAttempts = 0; await store.saveUser(u);
    await store.audit({ actorId: u.id, actorRole: u.role, action: 'user.phone_verified', entityType: 'user', entityId: u.id });
    return u;
  }

  async function overridePriority(reportId: string, actor: Actor, o: { category: PriorityOverride['category']; reason: string }): Promise<ReportRec> {
    if (actor.role !== 'coordinator' && actor.role !== 'admin') throw new EngineError('FORBIDDEN');
    if (o.reason.trim().length < 3) throw new WorkflowError('REASON_REQUIRED', 'override requires a reason');
    const r = await store.getReport(reportId); if (!r) throw new EngineError('NOT_FOUND');
    const prev = r.status, from = r.priorityCategory;
    r.priorityOverride = { category: o.category, reason: o.reason.trim(), by: actor.id, at: now() }; r.priorityCategory = o.category;
    r.priorityReasons = [...r.priorityReasons, `Reviewer override ${from} -> ${o.category}: ${o.reason.trim()}`];
    if (!(await store.saveReport(r, prev))) throw new EngineError('CONFLICT');
    await store.audit({ actorId: actor.id, actorRole: actor.role, action: 'report.priority_override', entityType: 'report', entityId: r.id, metadata: { from, to: o.category, reason: o.reason } });
    return r;
  }
  /** Attach already-sanitized, already-stored evidence. Volunteers only on their own task; staff always. */
  async function addEvidence(reportId: string, actor: Actor, ref: EvidenceRef): Promise<ReportRec> {
    const r = await store.getReport(reportId); if (!r) throw new EngineError('NOT_FOUND');
    if (actor.role === 'volunteer' && (r.assignedTo !== actor.id || !actor.identityApproved || !actor.phoneVerified)) throw new EngineError('FORBIDDEN');
    if (actor.role !== 'volunteer' && actor.role !== 'coordinator' && actor.role !== 'admin') throw new EngineError('FORBIDDEN');
    const prev = r.status; r.evidence = [...r.evidence, ref];
    if (!(await store.saveReport(r, prev))) throw new EngineError('CONFLICT');
    await store.audit({ actorId: actor.id, actorRole: actor.role, action: 'report.evidence_added', entityType: 'report', entityId: r.id, metadata: { evidenceId: ref.id, sha256: ref.sha256, kind: ref.kind } });
    return r;
  }
  /** Provider ACCEPTANCE (sent) and DELIVERY are different facts; only a delivery report may set DELIVERED. */
  const recordDeliveryReport = (d: { providerMessageId: string; status: string }) => store.updateDeliveryStatus(d.providerMessageId, d.status.toUpperCase());

  /** Erasure request: removes the resident's contact, hash linkage, photos and message history. Reports stay as anonymous records. */
  async function eraseResident(rawPhone: string): Promise<{ reports: number; evidenceFiles: number; messages: number }> {
    const phone = normalizeBdPhone(rawPhone); if (!phone) throw new EngineError('INVALID_PHONE');
    const h = hash(phone); if (await store.getUserByPhoneHash(h)) throw new EngineError('FORBIDDEN', 'number belongs to a staff/volunteer profile');
    let files = 0; const rs = await store.listReports({ reporterPhoneHash: h });
    for (const r of rs) {
      const evidence = [];
      for (const e of r.evidence) { if (e.kind === 'report' && !e.deletedAt) { await deps.storage?.delete(e.id); files++; evidence.push({ ...e, deletedAt: now() }); } else evidence.push(e); }
      await store.updateReporterFields(r.id, { reporterPhoneHash: `erased:${randomUUID()}`, reporterPhoneLast4: '', reporterPhoneEncrypted: null, consentToUpdates: false, evidence });
    }
    const messages = await store.deleteMessagesFor(h);
    await store.audit({ actorId: 'resident-request', actorRole: 'resident', action: 'resident.erased', entityType: 'resident', entityId: 'redacted', metadata: { reports: rs.length, evidenceFiles: files, messages } });
    return { reports: rs.length, evidenceFiles: files, messages };
  }
  /** Retention: contact numbers of finished (VERIFIED/REJECTED) reports are deleted `contactRetentionDays` after the last change. */
  async function purgeExpiredContacts(): Promise<number> {
    const cutoff = new Date(now().getTime() - cfg.contactRetentionDays * 86_400_000); let n = 0;
    for (const r of await store.listReports()) {
      if (r.reporterPhoneEncrypted && (r.status === 'VERIFIED' || r.status === 'REJECTED') && r.updatedAt < cutoff) { await store.updateReporterFields(r.id, { reporterPhoneEncrypted: null, consentToUpdates: false }); n++; }
    }
    if (n) await store.audit({ actorId: 'system', actorRole: 'system', action: 'retention.contacts_purged', entityType: 'report', entityId: 'batch', metadata: { count: n, retentionDays: cfg.contactRetentionDays } });
    return n;
  }

  return { eraseResident, purgeExpiredContacts, overridePriority, addEvidence, recordDeliveryReport, submitReport, transition, actorForUser, sendReminders, handleInboundSms, pollInboundSms, ussd, sendAreaAlert, requestPhoneOtp, verifyPhoneOtp, tryAutoAssign, isEligible };
}
export type Engine = ReturnType<typeof createEngine>;
