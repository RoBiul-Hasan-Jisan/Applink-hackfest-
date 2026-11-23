// Live OTP per https://dev.applink.com.bd/docs/otp (POST /otp/request, /otp/verify). OTP is valid for 5 minutes.
// NOTE (docs): "Upon a successful verification the subscription process of AppLink will be activated" - confirm side effects/charging with Applink.
import { ApplinkClient } from './applink.client.ts';
import { ApplinkError } from './applink.errors.ts';
import { OTP_REJECTED } from './status-codes.ts';
import { toTel } from './tel.ts';
import type { OtpGateway } from './gateway.ts';

export const OTP_VALID_MS = 5 * 60_000;
export class LiveOtpGateway implements OtpGateway {
  client: ApplinkClient; constructor(client: ApplinkClient) { this.client = client; }
  async request(phone: string) {
    const r = await this.client.post<{ referenceNo?: string }>('/otp/request', { subscriberId: toTel(phone, 'plain') }); // documented OTP format: tel:8801416177301
    if (!r.referenceNo) throw new ApplinkError('provider', 'OTP request succeeded but returned no referenceNo');
    return { referenceNo: String(r.referenceNo), expiresAt: new Date(Date.now() + OTP_VALID_MS) };
  }
  /** true ONLY for an explicit S1000. A wrong/expired/unknown code is false; any other failure throws (never treated as verified). */
  async verify(referenceNo: string, otp: string): Promise<boolean> {
    try { await this.client.post('/otp/verify', { referenceNo, otp }); return true; }
    catch (e) { if (e instanceof ApplinkError && e.kind === 'provider' && e.statusCode && (OTP_REJECTED as readonly string[]).includes(e.statusCode)) return false; throw e; }
  }
}
