// Live SMS send per https://dev.applink.com.bd/docs/sms (POST /sms/send). Inbound SMS arrives via the callback handlers (see callbacks.ts).
import { ApplinkClient } from './applink.client.ts';
import { ApplinkError } from './applink.errors.ts';
import { SUCCESS } from './status-codes.ts';
import { toTel, type TelStyle } from './tel.ts';
import type { InboundSms, SmsGateway } from './gateway.ts';

interface SendResp extends Record<string, unknown> { requestId?: string; destinationResponses?: { messageId?: string; statusCode?: string; statusDetail?: string }[] }
export class LiveSmsGateway implements SmsGateway {
  client: ApplinkClient; style: TelStyle; sourceAddress: string; encoding: string; private recent = new Map<string, { providerMessageId: string; providerRequestId: string }>();
  constructor(client: ApplinkClient, o: { style?: TelStyle; sourceAddress?: string; encoding?: string } = {}) { this.client = client; this.style = o.style ?? 'plain'; this.sourceAddress = o.sourceAddress ?? ''; this.encoding = o.encoding ?? ''; }

  async send(m: { to: string; body: string; idempotencyKey: string }) {
    const done = this.recent.get(m.idempotencyKey); if (done) return done; // never pay for the same logical message twice
    const r = await this.client.post<SendResp>('/sms/send', {
      version: '1.0', message: m.body, destinationAddresses: [toTel(m.to, this.style)], deliveryStatusRequest: '1', // ask for a delivery report: accepted is not delivered
      ...(this.sourceAddress ? { sourceAddress: this.sourceAddress } : {}), ...(this.encoding ? { encoding: this.encoding } : {}),
    }); // not marked idempotent: a network retry could duplicate an SMS
    const d = r.destinationResponses?.[0];
    if (!d || d.statusCode !== SUCCESS || !d.messageId) throw new ApplinkError('provider', `destination not accepted: ${d?.statusDetail ?? 'no destination response'}`, d?.statusCode);
    const out = { providerMessageId: d.messageId, providerRequestId: String(r.requestId ?? d.messageId) };
    this.recent.set(m.idempotencyKey, out); if (this.recent.size > 2000) this.recent.delete(this.recent.keys().next().value!);
    return out;
  }
  /** The documented /sms/receive response contains no message list, so polling cannot be implemented from the docs.
   *  Inbound messages must be pushed to our callback (confirm in provisioning). See docs/APPLINK_OPEN_QUESTIONS.md. */
  async fetchInbound(): Promise<InboundSms[]> { return []; }
}
