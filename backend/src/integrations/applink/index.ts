import { ApplinkClient, type LogEntry } from './applink.client.ts';
import { ApplinkError } from './applink.errors.ts';
import type { Gateways } from './gateway.ts';
import { LiveOtpGateway } from './otp.adapter.ts';
import { LiveSmsGateway } from './sms.adapter.ts';
import { LiveUssdGateway } from './ussd.adapter.ts';
import type { TelStyle } from './tel.ts';
import { createSimulatorGateways } from '../simulator.ts';

export interface LiveParams { baseUrl: string; applicationId: string; password: string; successStatusCodes: string[]; telStyle: TelStyle; sourceAddress?: string; log?: (e: LogEntry) => void }
export function createGateways(mode: 'simulator' | 'sandbox' | 'live', live?: LiveParams): Gateways {
  if (mode === 'simulator') return createSimulatorGateways();
  if (mode === 'sandbox') throw new ApplinkError('disabled', 'No Applink sandbox is documented. Use APPLINK_MODE=live with an approved application and whitelisted test numbers.');
  if (!live) throw new ApplinkError('disabled', 'live Applink parameters are required');
  const client = new ApplinkClient({ baseUrl: live.baseUrl, applicationId: live.applicationId, password: live.password, successStatusCodes: live.successStatusCodes, ...(live.log ? { log: live.log } : {}) });
  return { mode: 'live', sms: new LiveSmsGateway(client, { style: live.telStyle, ...(live.sourceAddress ? { sourceAddress: live.sourceAddress } : {}) }), otp: new LiveOtpGateway(client), ussd: new LiveUssdGateway(client) };
}
