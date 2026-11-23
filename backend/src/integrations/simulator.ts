// DEVELOPMENT SIMULATOR. Not AppLink. Nothing here touches the network or proves a live integration.
import { randomInt, randomUUID } from 'node:crypto';
import type { Gateways, InboundSms, OtpGateway, SmsGateway } from './applink/gateway.ts';

export interface SimOutboxItem { id: string; to: string; body: string; at: Date; simulated: true }
export class SimSms implements SmsGateway {
  outbox: SimOutboxItem[] = []; inbox: InboundSms[] = []; private seen = new Map<string, { providerMessageId: string; providerRequestId: string }>();
  async send(m: { to: string; body: string; idempotencyKey: string }) {
    const prev = this.seen.get(m.idempotencyKey); if (prev) return prev;
    const id = `sim-${randomUUID()}`; this.outbox.push({ id, to: m.to, body: m.body, at: new Date(), simulated: true });
    const r = { providerMessageId: id, providerRequestId: `simreq-${randomUUID()}` }; this.seen.set(m.idempotencyKey, r); return r;
  }
  async fetchInbound() { const x = this.inbox; this.inbox = []; return x; }
  receive(from: string, text: string) { this.inbox.push({ id: `siminbound-${randomUUID()}`, from, text, receivedAt: new Date() }); }
}
export class SimOtp implements OtpGateway {
  private pending = new Map<string, { otp: string; phone: string; expiresAt: Date }>(); lastOtpForDev = new Map<string, string>();
  async request(phone: string) {
    const referenceNo = `simref-${randomUUID()}`, otp = String(randomInt(100000, 1000000)), expiresAt = new Date(Date.now() + 5 * 60_000);
    this.pending.set(referenceNo, { otp, phone, expiresAt }); this.lastOtpForDev.set(phone, otp); return { referenceNo, expiresAt };
  }
  async verify(referenceNo: string, otp: string) {
    const p = this.pending.get(referenceNo); if (!p || p.expiresAt < new Date() || p.otp !== otp) return false;
    this.pending.delete(referenceNo); return true;
  }
}
export function createSimulatorGateways(): Gateways & { sms: SimSms; otp: SimOtp } { return { mode: 'simulator', sms: new SimSms(), otp: new SimOtp() }; }
