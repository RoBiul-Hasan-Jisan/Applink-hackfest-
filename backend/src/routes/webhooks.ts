// AppLink -> us. Mounted only for live mode. No signature exists in the docs; see callbacks.ts for the protections applied.
import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { handleDeliveryReport, handleSmsReceive, handleUssdReceive, type CallbackDeps, type CallbackResult } from '../integrations/applink/callbacks.ts';
import type { Ctx } from '../controllers/support.ts';

export function webhookRoutes(ctx: Ctx): Router {
  const a = ctx.applink!, r = Router();
  const deps: CallbackDeps = { applicationId: a.applicationId, store: ctx.store, engine: ctx.engine, ...(a.ussd ? { ussd: a.ussd } : {}),
    schedule: (fn) => { void fn(); }, log: (msg, meta) => console.warn(`[applink-callback] ${msg}`, meta ?? {}) }; // meta never contains numbers or secrets
  const ipGuard = (req: Request, res: Response, next: NextFunction) => {
    if (a.allowedIps.length && !a.allowedIps.includes(req.ip ?? '')) { res.status(403).json({ statusCode: 'E1303', statusDetail: 'Source not allowed.' }); return; }
    next();
  };
  const guard = [ipGuard, rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }), express.json({ limit: '20kb' })];
  const wire = (path: string, enabled: boolean, h: (b: unknown, d: CallbackDeps) => Promise<CallbackResult>) =>
    r.post(path, ...guard, async (req: Request, res: Response) => {
      if (!enabled) { res.status(404).json({ statusCode: 'E1315', statusDetail: 'Service not enabled.' }); return; }
      try { const out = await h(req.body, deps); res.status(out.http).json(out.body); } catch { res.status(500).json({ statusCode: 'E1601', statusDetail: 'Unexpected error.' }); }
    });
  wire('/webhooks/applink/ussd/receive', a.ussdEnabled, handleUssdReceive);
  wire('/webhooks/applink/sms/receive', a.smsEnabled, handleSmsReceive);
  wire('/webhooks/applink/sms/report', a.smsEnabled, handleDeliveryReport);
  return r;
}
