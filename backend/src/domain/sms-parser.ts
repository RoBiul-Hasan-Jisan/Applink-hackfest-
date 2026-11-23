// Parses inbound SMS commands. Pure; identity/ownership checks happen in the service layer.
export type ParsedSms =
  | { kind: 'ACCEPT' | 'DONE' | 'STATUS'; code: string }
  | { kind: 'CONFIRM'; fixed: boolean; code?: string } // resident reply 1 (fixed) / 2 (still a problem)
  | { kind: 'REPORT'; reportType: 'standing_water' | 'hotspot' | 'drainage' | 'other'; rest: string } // REPORT WATER <area> [landmark]
  | { kind: 'ERASE' } // resident asks for their contact, photos and message history to be erased
  | { kind: 'OPT_OUT' }
  | { kind: 'UNKNOWN'; hint?: 'MISSING_CODE' };

const BN_DIGITS: Record<string, string> = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
const CODE_RE = /\bDAI-(?:(\d{4})-)?(\d{3,6})\b/i;

export function normalizeReportCode(raw: string, year: number): string | null {
  const m = CODE_RE.exec(raw.trim());
  if (!m) return null;
  const y = m[1] ?? String(year); // short form DAI-1024 resolves to the current year
  return `DAI-${y}-${m[2]!.padStart(4, '0')}`;
}

export function parseSms(text: string, year: number): ParsedSms {
  const t = text.replace(/[০-৯]/g, (d) => BN_DIGITS[d]!).trim().replace(/\s+/g, ' ');
  if (!t) return { kind: 'UNKNOWN' };
  const up = t.toUpperCase();
  if (up === 'STOP' || up === 'UNSUBSCRIBE') return { kind: 'OPT_OUT' };
  if (up === 'ERASE' || up === 'DELETE DATA' || up === 'DELETE MY DATA') return { kind: 'ERASE' };
  const rp = /^REPORT (WATER|HOTSPOT|DRAIN|DRAINAGE|OTHER) (.+)$/.exec(up);
  if (rp) {
    const map = { WATER: 'standing_water', HOTSPOT: 'hotspot', DRAIN: 'drainage', DRAINAGE: 'drainage', OTHER: 'other' } as const;
    return { kind: 'REPORT', reportType: map[rp[1] as keyof typeof map], rest: t.slice(rp[0].length - rp[2]!.length) };
  }
  const m = /^(ACCEPT|DONE|STATUS)(?: (.*))?$/.exec(up);
  if (m) {
    const code = m[2] ? normalizeReportCode(m[2], year) : null;
    return code ? { kind: m[1] as 'ACCEPT' | 'DONE' | 'STATUS', code } : { kind: 'UNKNOWN', hint: 'MISSING_CODE' };
  }
  const c = /^([12])(?: (.*))?$/.exec(up);
  if (c) {
    const code = c[2] ? normalizeReportCode(c[2], year) : null;
    if (c[2] && !code) return { kind: 'UNKNOWN' };
    return { kind: 'CONFIRM', fixed: c[1] === '1', ...(code ? { code } : {}) };
  }
  return { kind: 'UNKNOWN' };
}
