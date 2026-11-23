// Handlers for the three documented callbacks (AppLink calls us). Pure functions: express wiring is in routes/webhooks.ts.
//  - POST /ussd/receive   (USSD Receive Services)
//  - POST /sms/receive    (inbound SMS: documented body = sourceAddress, message, requestId, encoding; see open question #1)
//  - POST /sms/report     (Delivery Status Report)
// The docs describe NO callback signature or auth header, so none is invented. Protections applied: strict payload validation, applicationId
// check where the payload carries it, replay/duplicate protection on requestId, optional IP allowlist (route level), fast acknowledgement.
import { z } from 'zod';
import type { Engine } from '../../domain/engine.ts';
import type { Store } from '../../domain/types.ts';
import type { UssdGateway } from './gateway.ts';

export interface CallbackDeps { applicationId: string; store: Store; engine: Engine; ussd?: UssdGateway; schedule: (fn: () => Promise<void>) => void; log?: (msg: string, meta?: Record<string, unknown>) => void }
export interface CallbackResult { http: number; body: { statusCode: string; statusDetail: string } }
const ok = (): CallbackResult => ({ http: 200, body: { statusCode: 'S1000', statusDetail: 'Success.' } });
const bad = (http: number, statusCode: string, statusDetail: string): CallbackResult => ({ http, body: { statusCode, statusDetail } });

const ussdIn = z.object({ version: z.string().optional(), applicationId: z.string(), message: z.string(), requestId: z.string().min(1), sessionId: z.string().min(1),
  ussdOperation: z.enum(['mo-init', 'mo-cont', 'mt-init', 'mt-cont', 'mt-fin']), sourceAddress: z.string().min(3), vlrAddress: z.string().optional(), encoding: z.string().optional() });
const smsIn = z.object({ version: z.string().optional(), applicationId: z.string(), sourceAddress: z.string().min(3), message: z.string(), requestId: z.string().min(1), encoding: z.string().optional() });
const smsReport = z.object({ destinationAddress: z.string().min(3), timeStamp: z.string(), requestId: z.string().min(1), deliveryStatus: z.enum(['DELIVERED', 'EXPIRED', 'DELETED', 'UNDELIVERABLE', 'ACCEPTED', 'UNKNOWN', 'REJECTED']) });

export async function handleUssdReceive(body: unknown, d: CallbackDeps): Promise<CallbackResult> {
  const p = ussdIn.safeParse(body); if (!p.success) return bad(400, 'E1312', 'Request is invalid.');
  const m = p.data; if (m.applicationId !== d.applicationId) return bad(403, 'E1313', 'Authentication failed.');
  if (!(await d.store.markProcessed(`ussd-in:${m.requestId}`))) return ok(); // gateway retry: acknowledge, never re-process
  if (!d.ussd || (m.ussdOperation !== 'mo-init' && m.ussdOperation !== 'mo-cont')) return ok(); // only subscriber-originated messages need a reply
  d.schedule(async () => {
    try {
      if (m.ussdOperation === 'mo-init') await d.store.deleteSession(m.sessionId); // a fresh dial always starts at the menu (the message is just the dial string)
      const r = await d.engine.ussd({ sessionId: m.sessionId, phone: m.sourceAddress, text: m.ussdOperation === 'mo-init' ? '' : m.message });
      await d.ussd!.send({ sessionId: m.sessionId, to: m.sourceAddress.trim(), message: r.text, end: !r.continueSession });
    } catch (e) { d.log?.('ussd reply failed', { sessionId: m.sessionId, err: (e as Error).message }); }
  });
  return ok();
}

export async function handleSmsReceive(body: unknown, d: CallbackDeps): Promise<CallbackResult> {
  const p = smsIn.safeParse(body); if (!p.success) return bad(400, 'E1312', 'Request is invalid.');
  const m = p.data; if (m.applicationId !== d.applicationId) return bad(403, 'E1313', 'Authentication failed.');
  if (m.encoding && m.encoding !== '0') { d.log?.('ignored non-text inbound SMS', { encoding: m.encoding }); return ok(); } // flash/binary are not commands
  d.schedule(async () => { try { await d.engine.handleInboundSms({ id: m.requestId, from: m.sourceAddress, text: m.message }); } catch (e) { d.log?.('inbound sms failed', { err: (e as Error).message }); } });
  return ok(); // duplicates are dropped inside the engine (idempotent on requestId)
}

export async function handleDeliveryReport(body: unknown, d: CallbackDeps): Promise<CallbackResult> {
  const p = smsReport.safeParse(body); if (!p.success) return bad(400, 'E1312', 'Request is invalid.');
  const m = p.data; // the report carries no applicationId, so it cannot be authenticated by content: it can only update a message we already sent
  if (!(await d.store.markProcessed(`sms-dr:${m.requestId}:${m.deliveryStatus}`))) return ok();
  const matched = await d.engine.recordDeliveryReport({ providerMessageId: m.requestId, status: m.deliveryStatus });
  if (!matched) d.log?.('delivery report did not match a sent message', { requestId: m.requestId });
  return ok(); // always acknowledge a well-formed report so the platform does not retry forever
}
