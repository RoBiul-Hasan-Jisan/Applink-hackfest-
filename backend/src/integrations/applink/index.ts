import { ApplinkError } from './applink.errors.ts';
import type { Gateways } from './gateway.ts';
import { createSimulatorGateways } from '../simulator.ts';

export function createGateways(mode: 'simulator' | 'sandbox' | 'live'): Gateways {
  if (mode === 'simulator') return createSimulatorGateways();
  throw new ApplinkError('disabled', `APPLINK_MODE=${mode}: live/sandbox adapters are not implemented yet. ` +
    'AppLink request/response fields have not been confirmed from the official docs; see docs/APPLINK_OPEN_QUESTIONS.md.');
}
