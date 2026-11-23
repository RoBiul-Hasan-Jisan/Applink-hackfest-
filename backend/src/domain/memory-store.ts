// In-memory Store used by tests, the seed dry-run and the simulator. Same contract as the Mongo store.
import type { Store, ReportRec, NewReport, AreaRec, RiskRec, UserRec, MessageRec, CampaignRec, AuditRec, Role } from './types.ts';
import type { UssdSession } from './ussd-machine.ts';
import type { Status } from './workflow.ts';

let n = 0;
const id = (p: string) => `${p}${++n}`;
export class MemoryStore implements Store {
  reports = new Map<string, ReportRec>(); areas = new Map<string, AreaRec>(); risks: RiskRec[] = [];
  users = new Map<string, UserRec>(); messages: MessageRec[] = []; campaigns: CampaignRec[] = [];
  sessions = new Map<string, UssdSession>(); processed = new Set<string>(); audits: AuditRec[] = []; counters = new Map<number, number>();
  clock: () => Date;
  constructor(clock: () => Date = () => new Date()) { this.clock = clock; }

  async nextReportCode(year: number) { const s = (this.counters.get(year) ?? 0) + 1; this.counters.set(year, s); return `DAI-${year}-${String(s).padStart(4, '0')}`; }
  async insertReport(r: NewReport) {
    if (r.idempotencyKey && [...this.reports.values()].some((x) => x.idempotencyKey === r.idempotencyKey)) throw new Error('DUPLICATE_KEY');
    const rec: ReportRec = { ...r, id: id('rep'), updatedAt: this.clock() }; this.reports.set(rec.id, rec); return structuredClone(rec);
  }
  async saveReport(r: ReportRec, expected: Status) {
    const cur = this.reports.get(r.id); if (!cur || cur.status !== expected) return false;
    this.reports.set(r.id, { ...structuredClone(r), updatedAt: this.clock() }); return true;
  }
  private c<T>(x: T | undefined): T | null { return x ? structuredClone(x) : null; }
  async getReport(i: string) { return this.c(this.reports.get(i)); }
  async getReportByCode(code: string) { return this.c([...this.reports.values()].find((r) => r.reportCode === code)); }
  async getReportByKey(k: string) { return this.c([...this.reports.values()].find((r) => r.idempotencyKey === k)); }
  async listReports(f: Parameters<Store['listReports']>[0] = {}) {
    return [...this.reports.values()].filter((r) => (!f.areaId || r.areaId === f.areaId) && (!f.status || r.status === f.status) &&
      (!f.assignedTo || r.assignedTo === f.assignedTo) && (!f.reporterPhoneHash || r.reporterPhoneHash === f.reporterPhoneHash))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => structuredClone(r));
  }
  async countReportsSince(h: string, since: Date) { return [...this.reports.values()].filter((r) => r.reporterPhoneHash === h && r.createdAt >= since).length; }
  async listAreas() { return [...this.areas.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  async getArea(i: string) { return this.areas.get(i) ?? null; }
  async latestRisk(a: string) { return this.risks.filter((r) => r.areaId === a).sort((x, y) => y.date.getTime() - x.date.getTime())[0] ?? null; }
  async riskHistory(a: string) { return this.risks.filter((r) => r.areaId === a).sort((x, y) => x.date.getTime() - y.date.getTime()); }
  async listUsers(role?: Role) { return [...this.users.values()].filter((u) => !role || u.role === role).map((u) => structuredClone(u)); }
  async getUser(i: string) { return this.c(this.users.get(i)); }
  async getUserByPhoneHash(h: string) { return this.c([...this.users.values()].find((u) => u.phoneHash === h)); }
  async getUserByFirebaseUid(uid: string) { return this.c([...this.users.values()].find((u) => u.firebaseUid === uid)); }
  async saveUser(u: UserRec) { this.users.set(u.id, structuredClone(u)); }
  async insertMessage(m: Omit<MessageRec, 'id'>) { const r = { ...m, id: id('msg') }; this.messages.push(r); return r; }
  async listMessages(limit: number) { return [...this.messages].reverse().slice(0, limit); }
  async hasRecentMessage(h: string, t: string, since: Date) { return this.messages.some((m) => m.toHash === h && m.template === t && m.createdAt >= since && m.status === 'sent'); }
  async insertCampaign(c: Omit<CampaignRec, 'id'>) { const r = { ...c, id: id('cmp') }; this.campaigns.push(r); return r; }
  async listCampaigns() { return [...this.campaigns].reverse(); }
  async getSession(i: string) { return this.c(this.sessions.get(i)); }
  async saveSession(s: UssdSession) { this.sessions.set(s.sessionId, structuredClone(s)); }
  async deleteSession(i: string) { this.sessions.delete(i); }
  async markProcessed(k: string) { if (this.processed.has(k)) return false; this.processed.add(k); return true; }
  async updateDeliveryStatus(id: string, st: string) { const m = this.messages.find((x) => x.providerMessageId === id || x.providerRequestId === id); if (!m) return false; m.deliveryStatus = st; return true; }
  async messageStats() {
    const sent = this.messages.filter((m) => m.status === 'sent'), delivered = sent.filter((m) => m.deliveryStatus === 'DELIVERED').length;
    return { total: this.messages.length, accepted: sent.length, failed: this.messages.length - sent.length, delivered, deliveryUnconfirmed: sent.length - delivered };
  }
  async updateReporterFields(id: string, f: Parameters<Store['updateReporterFields']>[1]) { const r = this.reports.get(id); if (r) Object.assign(r, structuredClone(f)); }
  async deleteMessagesFor(h: string) { const n = this.messages.length; this.messages = this.messages.filter((m) => m.toHash !== h); return n - this.messages.length; }
  async optOutPhone(h: string) { let c = 0; for (const r of this.reports.values()) if (r.reporterPhoneHash === h && (r.consentToUpdates || r.reporterPhoneEncrypted)) { r.consentToUpdates = false; r.reporterPhoneEncrypted = null; c++; } return c; }
  async optedInContacts(areaId: string) {
    const m = new Map<string, string>();
    for (const r of this.reports.values()) if (r.areaId === areaId && r.consentToUpdates && r.reporterPhoneEncrypted) m.set(r.reporterPhoneHash, r.reporterPhoneEncrypted);
    return [...m].map(([phoneHash, phoneEncrypted]) => ({ phoneHash, phoneEncrypted }));
  }
  async audit(a: Omit<AuditRec, 'createdAt'>) { this.audits.push({ ...a, createdAt: this.clock() }); }
  async listAudit(limit: number) { return [...this.audits].reverse().slice(0, limit); }
}
