// MongoDB implementation of the Store contract (same contract the in-memory store satisfies in tests).
import type { Types } from 'mongoose';
import { User, Area, Report, RiskScore, UssdSession, Message, AuditLog, Counter, ProcessedRequest, Campaign } from './index.ts';
import type { Store, ReportRec, NewReport, AreaRec, RiskRec, UserRec, MessageRec, CampaignRec, Role } from '../domain/types.ts';
import type { GeoPoint } from '../domain/duplicate.ts';
import type { UssdSession as Sess } from '../domain/ussd-machine.ts';
import type { Status } from '../domain/workflow.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;
const sid = (v: unknown): string => String((v as Types.ObjectId | string | undefined) ?? '');
const pt = (g?: Doc | null): GeoPoint | null => (g?.coordinates?.length === 2 ? { lng: g.coordinates[0], lat: g.coordinates[1] } : null);
const geo = (p: GeoPoint | null | undefined) => (p ? { type: 'Point', coordinates: [p.lng, p.lat] } : undefined);
const dupKey = (e: unknown): boolean => (e as { code?: number }).code === 11000;

const toReport = (d: Doc): ReportRec => ({
  id: sid(d._id), reportCode: d.reportCode, idempotencyKey: d.idempotencyKey ?? null, reporterPhoneHash: d.reporterPhoneHash, reporterPhoneLast4: d.reporterPhoneLast4 ?? '',
  reporterPhoneEncrypted: d.reporterPhoneEncrypted ?? null, type: d.type, areaId: sid(d.areaId), location: pt(d.location), landmark: d.landmark ?? null, status: d.status,
  priorityScore: d.priorityScore ?? 0, priorityCategory: d.priorityCategory ?? 'LOW', priorityReasons: d.priorityReasons ?? [], riskLevelAtCreation: d.riskLevelAtCreation ?? null,
  assignedTo: d.assignedTo ? sid(d.assignedTo) : null, duplicateOf: d.duplicateOf ? sid(d.duplicateOf) : null, history: (d.history ?? []).map((h: Doc) => ({ ...h })),
  residentConfirmed: d.residentConfirmed ?? null, source: d.source, consentToUpdates: !!d.consentToUpdates, reminderSentAt: d.reminderSentAt ?? null, evidenceNote: d.evidenceNote ?? null,
  evidence: (d.evidence ?? []).map((e: Doc) => ({ ...e })), evidenceCompleteness: d.evidenceCompleteness ?? 'MINIMAL', careNotes: d.careNotes ?? [],
  priorityRuleVersion: d.priorityRuleVersion ?? '', priorityOverride: d.priorityOverride ?? null,
  isSynthetic: !!d.isSynthetic, createdAt: d.createdAt, updatedAt: d.updatedAt,
});
const toArea = (d: Doc): AreaRec => ({ id: sid(d._id), name: d.name, type: d.type, centroid: pt(d.centroid) });
const toUser = (d: Doc): UserRec => ({
  id: sid(d._id), firebaseUid: d.firebaseUid, name: d.name, role: d.role, phoneHash: d.phoneHash ?? null, phoneEncrypted: d.phoneEncrypted ?? null, phoneVerified: !!d.phoneVerified,
  identityApproved: !!d.identityApproved, areaIds: (d.areaIds ?? []).map(sid), isAvailable: !!d.isAvailable, location: pt(d.location), otpRef: d.otpRef ?? null,
  otpExpiresAt: d.otpExpiresAt ?? null, otpAttempts: d.otpAttempts ?? 0, isSynthetic: !!d.isSynthetic, createdAt: d.createdAt,
});
const toRisk = (d: Doc): RiskRec => ({ areaId: sid(d.areaId), geographicLevel: d.geographicLevel, date: d.date, score: d.score, level: d.level, topFactors: d.topFactors ?? [], modelVersion: d.modelVersion, dataCoverage: d.dataCoverage, evaluationStatus: d.evaluationStatus });
const toMsg = (d: Doc): MessageRec => ({ id: sid(d._id), toHash: d.toHash, template: d.template, body: d.body, language: d.language, status: d.status, providerMessageId: d.providerMessageId ?? null, providerRequestId: d.providerRequestId ?? null, deliveryStatus: d.deliveryStatus ?? null, relatedReportId: d.relatedReportId ? sid(d.relatedReportId) : null, createdAt: d.createdAt });
const toCamp = (d: Doc): CampaignRec => ({ id: sid(d._id), areaId: sid(d.areaId), message: d.message, createdBy: d.createdBy, recipients: d.recipients, skipped: d.skipped, createdAt: d.createdAt });

export class MongoStore implements Store {
  async nextReportCode(year: number) {
    const c = await Counter.findOneAndUpdate({ _id: `report-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
    return `DAI-${year}-${String(c.seq).padStart(4, '0')}`;
  }
  async insertReport(r: NewReport) {
    try {
      const { location, ...rest } = r;
      const d = await Report.create({ ...rest, ...(location ? { location: geo(location) } : {}) });
      return toReport((await Report.findById(d._id).select('+reporterPhoneEncrypted').lean())!);
    } catch (e) { if (dupKey(e)) throw new Error('DUPLICATE_KEY'); throw e; }
  }
  async saveReport(r: ReportRec, expected: Status) {
    const res = await Report.updateOne({ _id: r.id, status: expected }, { $set: {
      status: r.status, assignedTo: r.assignedTo, priorityScore: r.priorityScore, priorityCategory: r.priorityCategory, priorityReasons: r.priorityReasons, history: r.history,
      residentConfirmed: r.residentConfirmed, reminderSentAt: r.reminderSentAt, evidenceNote: r.evidenceNote, duplicateOf: r.duplicateOf, consentToUpdates: r.consentToUpdates,
      reporterPhoneEncrypted: r.reporterPhoneEncrypted, evidence: r.evidence, priorityOverride: r.priorityOverride } });
    return res.matchedCount === 1; // compare-and-set on status: concurrent writers cannot both win
  }
  private rq = (q: Doc) => Report.find(q).select('+reporterPhoneEncrypted');
  async getReport(id: string) { const d = await Report.findById(id).select('+reporterPhoneEncrypted').lean(); return d ? toReport(d) : null; }
  async getReportByCode(code: string) { const d = await Report.findOne({ reportCode: code }).select('+reporterPhoneEncrypted').lean(); return d ? toReport(d) : null; }
  async getReportByKey(k: string) { const d = await Report.findOne({ idempotencyKey: k }).select('+reporterPhoneEncrypted').lean(); return d ? toReport(d) : null; }
  async listReports(f: Parameters<Store['listReports']>[0] = {}) { return (await this.rq({ ...f }).sort({ createdAt: -1 }).lean()).map(toReport); }
  countReportsSince(h: string, since: Date) { return Report.countDocuments({ reporterPhoneHash: h, createdAt: { $gte: since } }); }
  async listAreas() { return (await Area.find().sort({ name: 1 }).lean()).map(toArea); }
  async getArea(id: string) { const d = await Area.findById(id).lean().catch(() => null); return d ? toArea(d) : null; }
  async latestRisk(a: string) { const d = await RiskScore.findOne({ areaId: a }).sort({ date: -1 }).lean(); return d ? toRisk(d) : null; }
  async riskHistory(a: string) { return (await RiskScore.find({ areaId: a }).sort({ date: 1 }).lean()).map(toRisk); }
  async listUsers(role?: Role) { return (await User.find(role ? { role } : {}).lean()).map(toUser); }
  async getUser(id: string) { const d = await User.findById(id).lean().catch(() => null); return d ? toUser(d) : null; }
  async getUserByPhoneHash(h: string) { const d = await User.findOne({ phoneHash: h }).lean(); return d ? toUser(d) : null; }
  async getUserByFirebaseUid(uid: string) { const d = await User.findOne({ firebaseUid: uid }).lean(); return d ? toUser(d) : null; }
  async saveUser(u: UserRec) {
    const { id, location, createdAt: _c, ...rest } = u; void _c;
    await User.updateOne({ _id: id }, { $set: { ...rest, ...(location ? { location: geo(location) } : {}) }, ...(location ? {} : { $unset: { location: 1 } }) });
  }
  async insertMessage(m: Omit<MessageRec, 'id'>) { return toMsg((await Message.create(m)).toObject()); }
  async listMessages(limit: number) { return (await Message.find().sort({ createdAt: -1 }).limit(limit).lean()).map(toMsg); }
  async hasRecentMessage(h: string, t: string, since: Date) { return !!(await Message.exists({ toHash: h, template: t, status: 'sent', createdAt: { $gte: since } })); }
  async insertCampaign(c: Omit<CampaignRec, 'id'>) { return toCamp((await Campaign.create(c)).toObject()); }
  async listCampaigns() { return (await Campaign.find().sort({ createdAt: -1 }).limit(100).lean()).map(toCamp); }
  async getSession(id: string): Promise<Sess | null> {
    const d = await UssdSession.findOne({ sessionId: id }).lean(); if (!d) return null;
    return { sessionId: d.sessionId, phoneHash: d.phoneReference ?? '', state: d.state as Sess['state'], data: d.data ?? {}, expiresAt: d.expiresAt.getTime() };
  }
  async saveSession(s: Sess) {
    await UssdSession.updateOne({ sessionId: s.sessionId }, { $set: { phoneReference: s.phoneHash, state: s.state, data: s.data, expiresAt: new Date(s.expiresAt + 60_000) } }, { upsert: true });
  }
  async deleteSession(id: string) { await UssdSession.deleteOne({ sessionId: id }); }
  async markProcessed(key: string) { try { await ProcessedRequest.create({ key }); return true; } catch (e) { if (dupKey(e)) return false; throw e; } }
  async updateDeliveryStatus(id: string, st: string) { return (await Message.updateOne({ $or: [{ providerMessageId: id }, { providerRequestId: id }] }, { $set: { deliveryStatus: st } })).matchedCount === 1; }
  async messageStats() {
    const [total, accepted, delivered] = await Promise.all([Message.countDocuments(), Message.countDocuments({ status: 'sent' }), Message.countDocuments({ status: 'sent', deliveryStatus: 'DELIVERED' })]);
    return { total, accepted, failed: total - accepted, delivered, deliveryUnconfirmed: accepted - delivered };
  }
  async updateReporterFields(id: string, f: Parameters<Store['updateReporterFields']>[1]) { await Report.updateOne({ _id: id }, { $set: { ...f } }); }
  async deleteMessagesFor(h: string) { return (await Message.deleteMany({ toHash: h })).deletedCount; }
  async optOutPhone(h: string) { return (await Report.updateMany({ reporterPhoneHash: h }, { $set: { consentToUpdates: false }, $unset: { reporterPhoneEncrypted: 1 } })).modifiedCount; }
  async optedInContacts(areaId: string) {
    const ds = await Report.find({ areaId, consentToUpdates: true, reporterPhoneEncrypted: { $ne: null } }).select('+reporterPhoneEncrypted reporterPhoneHash').lean();
    return [...new Map(ds.map((d: Doc) => [d.reporterPhoneHash, d.reporterPhoneEncrypted as string])).entries()].map(([phoneHash, phoneEncrypted]) => ({ phoneHash, phoneEncrypted }));
  }
  async audit(a: Parameters<Store['audit']>[0]) { await AuditLog.create(a); }
  async listAudit(limit: number) { return (await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean()).map((d: Doc) => ({ actorId: d.actorId, actorRole: d.actorRole, action: d.action, entityType: d.entityType, entityId: d.entityId, metadata: d.metadata, createdAt: d.createdAt })); }
}
