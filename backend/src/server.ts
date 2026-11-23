import mongoose from 'mongoose';
import { env } from './config/env.ts';
import { createApp } from './app.ts';
import { MongoStore } from './models/mongo-store.ts';
import { createGateways } from './integrations/applink/index.ts';
import { createEngine, defaultEngineConfig } from './domain/engine.ts';
import { startJobs } from './jobs/scheduler.ts';
import { LocalEvidenceStorage } from './integrations/storage.ts';
import { getFirebaseAuth } from './config/firebase.ts';

getFirebaseAuth(); // fail fast if Firebase Admin is not configured
await mongoose.connect(env.MONGODB_URI);
const gw = createGateways(env.APPLINK_MODE); // throws for sandbox/live until adapters are implemented
const store = new MongoStore();
const storage = new LocalEvidenceStorage(env.EVIDENCE_DIR);
const engine = createEngine({ store, sms: gw.sms, otp: gw.otp, storage, cfg: defaultEngineConfig({ phoneHashSecret: env.PHONE_HASH_SECRET, phoneEncryptionKey: env.PHONE_ENCRYPTION_KEY },
  { dailyReportLimit: env.DAILY_REPORT_LIMIT_PER_PHONE, smsLanguage: env.SMS_LANGUAGE, contactRetentionDays: env.REPORTER_CONTACT_RETENTION_DAYS }) });
const ctx = { store, engine, gw, storage, mode: gw.mode, slaHours: env.RESPONSE_SLA_HOURS, smsLanguage: env.SMS_LANGUAGE };
startJobs(ctx, env.SMS_POLL_SECONDS);
createApp(ctx).listen(env.PORT, () => console.log(`API on :${env.PORT} | AppLink mode: ${gw.mode.toUpperCase()}${gw.mode === 'simulator' ? ' (DEVELOPMENT SIMULATOR, not live AppLink)' : ''}`));
