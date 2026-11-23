import type { Status, HistoryEntry } from './workflow.ts';
import type { ReportType, PriorityCategory } from './priority.ts';
import type { GeoPoint } from './duplicate.ts';
import type { UssdSession } from './ussd-machine.ts';

export interface EvidenceRef { id: string; sha256: string; mime: string; bytes: number; kind: 'report' | 'action'; uploadedAt: Date; uploadedBy: string; deletedAt?: Date | null }
export interface PriorityOverride { category: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; reason: string; by: string; at: Date }
export type Role = 'volunteer' | 'coordinator' | 'admin';
export interface ReportRec {
  id: string; reportCode: string; idempotencyKey: string | null;
  reporterPhoneHash: string; reporterPhoneLast4: string; reporterPhoneEncrypted: string | null;
  type: ReportType; areaId: string; location: GeoPoint | null; landmark: string | null;
  status: Status; priorityScore: number; priorityCategory: PriorityCategory; priorityReasons: string[];
  riskLevelAtCreation: string | null; assignedTo: string | null; duplicateOf: string | null;
  history: HistoryEntry[]; residentConfirmed: boolean | null; source: 'ussd' | 'sms' | 'web';
  consentToUpdates: boolean; reminderSentAt: Date | null; evidenceNote: string | null;
  evidence: EvidenceRef[]; evidenceCompleteness: 'COMPLETE' | 'PARTIAL' | 'MINIMAL'; careNotes: string[];
  priorityRuleVersion: string; priorityOverride: PriorityOverride | null;
  isSynthetic: boolean; createdAt: Date; updatedAt: Date;
}
export interface AreaRec { id: string; name: string; type: 'ward' | 'area' | 'upazila' | 'district' | 'division'; centroid: GeoPoint | null }
export interface RiskRec {
  areaId: string; geographicLevel: AreaRec['type']; date: Date; score: number; level: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  topFactors: { name: string; contribution: number }[]; modelVersion: string; dataCoverage: string;
  evaluationStatus: 'validated' | 'not_validated' | 'rules_based_fallback';
}
export interface UserRec {
  id: string; firebaseUid: string; name: string; role: Role; phoneHash: string | null; phoneEncrypted: string | null;
  phoneVerified: boolean; identityApproved: boolean; areaIds: string[]; isAvailable: boolean; location: GeoPoint | null;
  otpRef: string | null; otpExpiresAt: Date | null; otpAttempts: number;
  isSynthetic: boolean; createdAt: Date;
}
export interface MessageRec {
  id: string; toHash: string; template: string; body: string; language: string; status: 'sent' | 'failed';
  providerMessageId: string | null; providerRequestId: string | null; deliveryStatus: string | null;
  relatedReportId: string | null; createdAt: Date;
}
export interface CampaignRec { id: string; areaId: string; message: string; createdBy: string; recipients: number; skipped: number; createdAt: Date }
export interface AuditRec { actorId: string; actorRole: string; action: string; entityType: string; entityId: string; metadata?: unknown; createdAt: Date }

export type NewReport = Omit<ReportRec, 'id' | 'updatedAt'>;
export interface Store {
  nextReportCode(year: number): Promise<string>;
  insertReport(r: NewReport): Promise<ReportRec>; // must enforce unique idempotencyKey (throws 'DUPLICATE_KEY')
  /** compare-and-set on status; returns false if the stored status != expectedStatus */
  saveReport(r: ReportRec, expectedStatus: Status): Promise<boolean>;
  getReport(id: string): Promise<ReportRec | null>;
  getReportByCode(code: string): Promise<ReportRec | null>;
  getReportByKey(key: string): Promise<ReportRec | null>;
  listReports(f?: { areaId?: string; status?: Status; assignedTo?: string; reporterPhoneHash?: string }): Promise<ReportRec[]>;
  countReportsSince(phoneHash: string, since: Date): Promise<number>;
  listAreas(): Promise<AreaRec[]>; getArea(id: string): Promise<AreaRec | null>;
  latestRisk(areaId: string): Promise<RiskRec | null>; riskHistory(areaId: string): Promise<RiskRec[]>;
  listUsers(role?: Role): Promise<UserRec[]>; getUser(id: string): Promise<UserRec | null>;
  getUserByPhoneHash(h: string): Promise<UserRec | null>; getUserByFirebaseUid(uid: string): Promise<UserRec | null>;
  saveUser(u: UserRec): Promise<void>;
  insertMessage(m: Omit<MessageRec, 'id'>): Promise<MessageRec>; listMessages(limit: number): Promise<MessageRec[]>;
  hasRecentMessage(toHash: string, template: string, since: Date): Promise<boolean>;
  insertCampaign(c: Omit<CampaignRec, 'id'>): Promise<CampaignRec>; listCampaigns(): Promise<CampaignRec[]>;
  getSession(id: string): Promise<UssdSession | null>; saveSession(s: UssdSession): Promise<void>; deleteSession(id: string): Promise<void>;
  markProcessed(key: string): Promise<boolean>; // true only the first time (replay/dedup protection)
  updateDeliveryStatus(providerMessageId: string, deliveryStatus: string): Promise<boolean>;
  messageStats(): Promise<{ total: number; accepted: number; failed: number; delivered: number; deliveryUnconfirmed: number }>;
  updateReporterFields(reportId: string, f: Partial<Pick<ReportRec, 'reporterPhoneHash' | 'reporterPhoneLast4' | 'reporterPhoneEncrypted' | 'consentToUpdates' | 'evidence'>>): Promise<void>;
  deleteMessagesFor(toHash: string): Promise<number>;
  optOutPhone(phoneHash: string): Promise<number>;
  optedInContacts(areaId: string): Promise<{ phoneHash: string; phoneEncrypted: string }[]>;
  audit(a: Omit<AuditRec, 'createdAt'>): Promise<void>; listAudit(limit: number): Promise<AuditRec[]>;
}
