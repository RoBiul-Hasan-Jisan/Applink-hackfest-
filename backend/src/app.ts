import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env.ts';
import { errorHandler, type Ctx } from './controllers/support.ts';
import { reportRoutes } from './routes/reports.ts';
import { accountRoutes } from './routes/account.ts';
import { insightRoutes } from './routes/insights.ts';
import { integrityRoutes } from './routes/integrity.ts';
import { webhookRoutes } from './routes/webhooks.ts';
import { simRoutes } from './routes/sim.ts';

export function createApp(ctx: Ctx): express.Express {
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', 1);
  app.use(helmet()); app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(['/public/reports', '/api/reports/:id/evidence'], express.json({ limit: '8mb' })); // photo uploads only
  app.use(express.json({ limit: '100kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
  app.get('/health', (_req, res) => { const db = mongoose.connection.readyState === 1; res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db, applinkMode: ctx.mode }); });
  app.use(reportRoutes(ctx)); app.use(accountRoutes(ctx)); app.use(insightRoutes(ctx)); app.use(integrityRoutes(ctx));
  if (ctx.mode === 'simulator' && env.NODE_ENV !== 'production') app.use(simRoutes(ctx));
  if (ctx.applink) app.use(webhookRoutes(ctx)); // live mode only: /webhooks/applink/{ussd/receive,sms/receive,sms/report}
  app.use((_req, res) => { res.status(404).json({ error: 'not_found' }); });
  app.use(errorHandler);
  return app;
}
