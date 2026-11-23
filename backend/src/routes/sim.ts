// DEVELOPMENT SIMULATOR ROUTES. Mounted only when APPLINK_MODE=simulator and NODE_ENV!=production.
// These are NOT AppLink endpoints and their payloads are our own; they prove our workflow, not the provider integration.
import { Router } from 'express';
import { ah, type Ctx } from '../controllers/support.ts';
import * as v from '../validators/index.ts';
import type { SimSms, SimOtp } from '../integrations/simulator.ts';
import { normalizeBdPhone } from '../domain/phone-crypto.ts';

export function simRoutes(ctx: Ctx): Router {
  const r = Router(), sms = ctx.gw.sms as SimSms, otp = ctx.gw.otp as SimOtp;
  r.get('/sim/mode', (_q, res) => res.json({ mode: 'simulator', warning: 'DEVELOPMENT SIMULATOR - not live AppLink' }));
  r.post('/sim/ussd', ah(async (req, res) => {
    const b = v.simUssd.parse(req.body);
    const out = await ctx.engine.ussd({ sessionId: b.sessionId, phone: b.msisdn, text: b.text });
    res.json({ text: out.text, continueSession: out.continueSession, simulated: true });
  }));
  r.post('/sim/sms', ah(async (req, res) => { const b = v.simSms.parse(req.body); sms.receive(b.from, b.text); res.json({ processed: await ctx.engine.pollInboundSms(), simulated: true }); }));
  r.get('/sim/outbox', (req, res) => { const p = normalizeBdPhone(String(req.query.phone ?? '')); res.json(sms.outbox.filter((m) => !p || m.to === p).slice(-100).reverse()); });
  r.get('/sim/otp/:phone', (req, res) => { const p = normalizeBdPhone(String(req.params.phone)); res.json({ otp: (p && otp.lastOtpForDev.get(p)) ?? null, simulated: true }); });
  return r;
}
