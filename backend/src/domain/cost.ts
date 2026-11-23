// Usage/cost estimator. Rates are CONFIGURABLE ASSUMPTIONS taken from the published doc figures quoted in the
// project brief (BDT 2/SMS, BDT 2/USSD menu). Not verified against the approved application's actual pricing.
export interface Rates { smsBdt: number; ussdMenuBdt: number }
export const DEFAULT_RATES: Rates = { smsBdt: 2, ussdMenuBdt: 2 };
export interface Usage { ussdMenus: number; sms: number }
export const estimateCost = (u: Usage, r: Rates = DEFAULT_RATES): number => u.ussdMenus * r.ussdMenuBdt + u.sms * r.smsBdt;

// Happy-path report: menu, area, landmark, confirm, final screen = 5 menus (ASSUMES one charge per screen shown).
export const REPORT_FLOW: Usage = { ussdMenus: 5, sms: 1 };
// Full lifecycle SMS: reporter confirmation, volunteer assignment, resolution-confirmation request, reporter reopen/ack.
export const LIFECYCLE_SMS = ['report_received', 'volunteer_assigned', 'resolution_request'] as const;
export const lifecycleUsage = (): Usage => ({ ussdMenus: REPORT_FLOW.ussdMenus, sms: LIFECYCLE_SMS.length });
