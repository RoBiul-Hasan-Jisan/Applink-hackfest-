import { Schema, model, type InferSchemaType } from 'mongoose';

const point = { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number], default: undefined } }; // no [] default: breaks 2dsphere
const STATUS = ['NEW', 'APPROVED', 'ASSIGNED', 'ACCEPTED', 'CLEANED', 'VERIFIED', 'REJECTED', 'REOPENED'];
const TYPE = ['standing_water', 'hotspot', 'drainage', 'other'];

const userSchema = new Schema({
  firebaseUid: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phoneEncrypted: String, phoneHash: { type: String, index: true, sparse: true, unique: true }, phoneLast4: String,
  role: { type: String, enum: ['volunteer', 'coordinator', 'admin'], required: true },
  phoneVerified: { type: Boolean, default: false },
  identityApproved: { type: Boolean, default: false }, // admin decision, separate from OTP
  areaIds: [{ type: Schema.Types.ObjectId, ref: 'Area' }],
  isAvailable: { type: Boolean, default: false },
  location: point,
  otpRef: { type: String, default: null }, otpExpiresAt: { type: Date, default: null }, otpAttempts: { type: Number, default: 0 }, // the OTP value itself is never stored
  isSynthetic: { type: Boolean, default: false },
}, { timestamps: true });
userSchema.index({ location: '2dsphere' }, { sparse: true });

const areaSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['ward', 'area', 'upazila', 'district', 'division'], required: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Area' },
  geometry: { type: { type: String, enum: ['Polygon', 'MultiPolygon'] }, coordinates: Schema.Types.Mixed },
  centroid: point,
}, { timestamps: true });
areaSchema.index({ geometry: '2dsphere' }, { sparse: true });
areaSchema.index({ centroid: '2dsphere' }, { sparse: true });

const historySchema = new Schema({
  actorId: String, actorRole: String, at: Date, from: { type: String, enum: STATUS }, to: { type: String, enum: STATUS },
  action: String, notes: String, reason: String,
}, { _id: false });

const reportSchema = new Schema({
  reportCode: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, unique: true, sparse: true }, // USSD sessionId / SMS provider message id
  reporterPhoneHash: { type: String, required: true, index: true },
  reporterPhoneLast4: String,
  reporterPhoneEncrypted: { type: String, select: false }, // only stored when consentToUpdates; purged after retention
  type: { type: String, enum: TYPE, required: true },
  areaId: { type: Schema.Types.ObjectId, ref: 'Area', required: true, index: true },
  location: point, landmark: String,
  status: { type: String, enum: STATUS, default: 'NEW', index: true },
  priorityScore: Number, priorityCategory: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }, priorityReasons: [String],
  riskLevelAtCreation: String,
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  duplicateOf: { type: Schema.Types.ObjectId, ref: 'Report', default: null },
  history: [historySchema],
  residentConfirmed: { type: Boolean, default: null },
  source: { type: String, enum: ['ussd', 'sms', 'web'], required: true },
  consentToUpdates: { type: Boolean, default: false },
  reminderSentAt: { type: Date, default: null }, evidenceNote: { type: String, default: null },
  evidence: { type: [Schema.Types.Mixed], default: [] }, // {id, sha256, mime, bytes, kind, uploadedAt, uploadedBy}; files live in private storage
  evidenceCompleteness: { type: String, enum: ['COMPLETE', 'PARTIAL', 'MINIMAL'], default: 'MINIMAL' }, careNotes: [String],
  priorityRuleVersion: String, priorityOverride: { type: Schema.Types.Mixed, default: null },
  isSynthetic: { type: Boolean, default: false },
}, { timestamps: true });
reportSchema.index({ location: '2dsphere' }, { sparse: true });
reportSchema.index({ areaId: 1, type: 1, createdAt: -1 });

const riskSchema = new Schema({
  areaId: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
  geographicLevel: { type: String, enum: ['ward', 'area', 'upazila', 'district', 'division'], required: true },
  date: { type: Date, required: true }, score: { type: Number, min: 0, max: 100, required: true },
  level: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'], required: true },
  topFactors: [{ name: String, contribution: Number }],
  modelVersion: { type: String, required: true }, dataCoverage: { type: String, required: true },
  evaluationStatus: { type: String, enum: ['validated', 'not_validated', 'rules_based_fallback'], required: true },
  isEstimate: { type: Boolean, default: true, enum: [true] },
}, { timestamps: { createdAt: true, updatedAt: false } });
riskSchema.index({ areaId: 1, date: -1 });

const ussdSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true }, phoneReference: String,
  state: String, language: { type: String, default: 'en' }, data: Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
ussdSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

const messageSchema = new Schema({
  toHash: String, template: String, body: String, language: String,
  providerMessageId: { type: String, index: true, sparse: true }, providerRequestId: String,
  status: String, deliveryStatus: String, relatedReportId: { type: Schema.Types.ObjectId, ref: 'Report' },
}, { timestamps: { createdAt: true, updatedAt: true } });

const campaignSchema = new Schema({
  areaId: { type: Schema.Types.ObjectId, ref: 'Area', required: true }, message: String, createdBy: String, recipients: Number, skipped: Number,
}, { timestamps: true });

const auditSchema = new Schema({
  actorId: String, actorRole: String, action: { type: String, required: true },
  entityType: String, entityId: String, metadata: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });

// Atomic report-code sequence (DAI-YYYY-NNNN) and webhook/request de-duplication with TTL replay window.
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const processedSchema = new Schema({ key: { type: String, unique: true, required: true }, at: { type: Date, default: Date.now, expires: 86400 } });

export const User = model('User', userSchema);
export const Area = model('Area', areaSchema);
export const Report = model('Report', reportSchema);
export const RiskScore = model('RiskScore', riskSchema, 'risk_scores');
export const UssdSession = model('UssdSession', ussdSessionSchema, 'ussd_sessions');
export const Message = model('Message', messageSchema);
export const Campaign = model('Campaign', campaignSchema);
export const AuditLog = model('AuditLog', auditSchema, 'audit_logs');
export const Counter = model('Counter', counterSchema);
export const ProcessedRequest = model('ProcessedRequest', processedSchema, 'processed_requests');
export type ReportDoc = InferSchemaType<typeof reportSchema>;

