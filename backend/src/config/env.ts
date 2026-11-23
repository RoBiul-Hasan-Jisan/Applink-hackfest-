import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().default(''), // required by the API server (checked lazily in config/firebase.ts); scripts like seed do not need it
  FIREBASE_CLIENT_EMAIL: z.string().default(''),
  FIREBASE_PRIVATE_KEY: z.string().default(''),
  EVIDENCE_DIR: z.string().default('./evidence-private'),
  SMS_LANGUAGE: z.enum(['en', 'bn']).default('en'),
  SMS_POLL_SECONDS: z.coerce.number().int().min(5).default(30),
  RESPONSE_SLA_HOURS: z.coerce.number().int().positive().default(72),
  APPLINK_MODE: z.enum(['simulator', 'sandbox', 'live']).default('simulator'),
  APPLINK_BASE_URL: z.string().url().default('https://api.applink.com.bd'),
  APPLINK_APPLICATION_ID: z.string().default(''),
  APPLINK_PASSWORD: z.string().default(''),
  APPLINK_USSD_ENABLED: bool, APPLINK_SMS_ENABLED: bool, APPLINK_OTP_ENABLED: bool,
  WEBHOOK_SECRET: z.string().default(''),
  PHONE_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes base64'),
  PHONE_HASH_SECRET: z.string().min(16),
  REPORTER_CONTACT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  DAILY_REPORT_LIMIT_PER_PHONE: z.coerce.number().int().positive().default(5),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV === 'production' && e.APPLINK_MODE === 'simulator')
    ctx.addIssue({ code: 'custom', message: 'APPLINK_MODE=simulator is not allowed in production: a simulator must never stand in for a live integration' });
  if (e.APPLINK_MODE !== 'simulator' && (!e.APPLINK_APPLICATION_ID || !e.APPLINK_PASSWORD))
    ctx.addIssue({ code: 'custom', message: 'APPLINK_APPLICATION_ID and APPLINK_PASSWORD required unless APPLINK_MODE=simulator' });
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
export type Env = typeof env;
