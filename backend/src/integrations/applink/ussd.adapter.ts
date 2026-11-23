// Live USSD send per https://dev.applink.com.bd/docs/ussd (POST /ussd/send). Encoding 440 = plain ASCII only.
// Flow: AppLink POSTs the user's input to OUR /ussd/receive; we acknowledge, then push each screen with /ussd/send (mt-cont, or mt-fin for the last one).
import { ApplinkClient } from './applink.client.ts';
import { ApplinkError } from './applink.errors.ts';
import type { UssdGateway } from './gateway.ts';

export class LiveUssdGateway implements UssdGateway {
  client: ApplinkClient; constructor(client: ApplinkClient) { this.client = client; }
  async send(m: { sessionId: string; to: string; message: string; end: boolean }) {
    if (!/^[\x20-\x7E\n]*$/.test(m.message)) throw new ApplinkError('provider', 'USSD message must be plain ASCII (encoding 440)');
    const r = await this.client.post<{ requestId?: string }>('/ussd/send', { version: '1.0', message: m.message, sessionId: m.sessionId, ussdOperation: m.end ? 'mt-fin' : 'mt-cont', destinationAddress: m.to, encoding: '440' });
    return { requestId: String(r.requestId ?? '') };
  }
}
