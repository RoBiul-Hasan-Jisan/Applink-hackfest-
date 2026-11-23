// Pure USSD session state machine. It decides screen text + whether the session continues.
// It deliberately knows NOTHING about AppLink wire format (mo-init/mt-cont/mt-fin, encoding flags):
// mapping `continueSession` to documented operations belongs to the AppLink USSD adapter (blocked on docs).
// All text is plain ASCII and <=160 chars (asserted in tests).
import type { ReportType } from './priority.ts';

export type UssdState = 'MENU' | 'AREA' | 'LANDMARK' | 'CONFIRM' | 'TRACK_CODE';
export interface UssdData {
  purpose?: 'report' | 'risk'; reportType?: ReportType; areaId?: string; areaName?: string;
  landmark?: string; page?: number; invalid?: number;
}
export interface UssdSession {
  sessionId: string; phoneHash: string; state: UssdState; data: UssdData; expiresAt: number;
}
export interface AreaOption { id: string; name: string }
export interface RiskInfo { level: string; score: number }
export interface UssdDeps {
  listAreas(): Promise<AreaOption[]>;
  getRisk(areaId: string): Promise<RiskInfo | null>;
  getReportStatus(code: string, phoneHash: string): Promise<{ status: string } | null>; // null if missing OR not owner
  submitReport(d: { idempotencyKey: string; type: ReportType; areaId: string; landmark?: string; consentToUpdates: boolean }): Promise<{ code: string }>;
}
export interface UssdResult { text: string; continueSession: boolean; session: UssdSession | null }

export const SESSION_TTL_MS = 120_000;
export const PAGE_SIZE = 4;
const MAX_INVALID = 3;
const MENU = 'DengueZero\n1.Report standing water\n2.Report mosquito hotspot\n3.Check dengue risk\n4.Prevention tips\n5.Track my report\n0.Exit';
const TIPS = [
  'Empty and scrub containers holding water at least once a week.',
  'Cover water storage tanks and drums tightly.',
  'Clear blocked drains and gutters so water does not pool.',
  'Remove water from flower pot trays, tyres and buckets.',
  'Use mosquito nets or repellent, especially at dawn and dusk.',
];
const STATUS_TEXT: Record<string, string> = {
  NEW: 'Received. Awaiting human review.', APPROVED: 'Reviewed and accepted. Waiting for a volunteer.', ASSIGNED: 'A volunteer has been assigned.',
  ACCEPTED: 'Volunteer is working on it.', CLEANED: 'Cleaned. Awaiting verification.',
  VERIFIED: 'Verified resolved. Reply 2 by SMS if the problem remains.',
  REJECTED: 'Not accepted as a valid report.', REOPENED: 'Reopened. Escalated for action.',
};
const TYPE_LABEL: Record<ReportType, string> = { standing_water: 'Standing water', hotspot: 'Mosquito hotspot', drainage: 'Blocked drain', other: 'Other' };

const ascii = (s: string, max: number) => s.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const end = (text: string): UssdResult => ({ text: ascii2(text), continueSession: false, session: null });
const ascii2 = (t: string) => t.slice(0, 160);
const cont = (text: string, session: UssdSession): UssdResult => ({ text: ascii2(text), continueSession: true, session });

export function sanitizeLandmark(s: string): string { return ascii(s, 60); }

function areaScreen(areas: AreaOption[], page: number): string {
  const slice = areas.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const lines = slice.map((a, i) => `${i + 1}.${ascii(a.name, 18)}`);
  const nav = [page > 0 ? '8.Prev' : '', (page + 1) * PAGE_SIZE < areas.length ? '9.More' : '', '0.Menu'].filter(Boolean).join(' ');
  return `Select area:\n${lines.join('\n')}\n${nav}`;
}

export function newSession(sessionId: string, phoneHash: string, now: number): UssdSession {
  return { sessionId, phoneHash, state: 'MENU', data: {}, expiresAt: now + SESSION_TTL_MS };
}

export async function step(existing: UssdSession | null, input: string, deps: UssdDeps,
  ctx: { sessionId: string; phoneHash: string; now: number }): Promise<UssdResult> {
  const { now } = ctx;
  // Missing or expired session -> restart at the main menu (input ignored).
  if (!existing || existing.expiresAt <= now) return cont(MENU, newSession(ctx.sessionId, ctx.phoneHash, now));
  const s: UssdSession = { ...existing, data: { ...existing.data }, expiresAt: now + SESSION_TTL_MS };
  const text = input.trim();

  const invalid = (msg: string, redraw: () => Promise<string> | string): Promise<UssdResult> | UssdResult => {
    s.data.invalid = (s.data.invalid ?? 0) + 1;
    if (s.data.invalid >= MAX_INVALID) return end('Too many invalid entries. Please dial again.');
    return Promise.resolve(redraw()).then((screen) => cont(`${msg}\n${screen}`, s));
  };

  switch (s.state) {
    case 'MENU': {
      if (text === '0') return end('Thank you. Stay safe.');
      if (text === '1' || text === '2') {
        s.data = { purpose: 'report', reportType: text === '1' ? 'standing_water' : 'hotspot', page: 0 };
        const areas = await deps.listAreas();
        if (areas.length === 0) return end('Service unavailable: no areas configured. Try later.');
        s.state = 'AREA';
        return cont(areaScreen(areas, 0), s);
      }
      if (text === '3') {
        s.data = { purpose: 'risk', page: 0 };
        const areas = await deps.listAreas();
        if (areas.length === 0) return end('Service unavailable: no areas configured. Try later.');
        s.state = 'AREA';
        return cont(areaScreen(areas, 0), s);
      }
      if (text === '4') return end(`Tip: ${TIPS[new Date(now).getUTCDate() % TIPS.length]}`);
      if (text === '5') { s.state = 'TRACK_CODE'; return cont('Enter report code (e.g. DAI-2026-0001):', s); }
      return invalid('Invalid choice.', () => MENU);
    }
    case 'AREA': {
      const areas = await deps.listAreas();
      const page = s.data.page ?? 0;
      if (text === '0') return cont(MENU, { ...s, state: 'MENU', data: {} });
      if (text === '9' && (page + 1) * PAGE_SIZE < areas.length) { s.data.page = page + 1; return cont(areaScreen(areas, page + 1), s); }
      if (text === '8' && page > 0) { s.data.page = page - 1; return cont(areaScreen(areas, page - 1), s); }
      const idx = /^[1-9]$/.test(text) ? Number(text) - 1 : -1;
      const area = idx >= 0 && idx < PAGE_SIZE ? areas[page * PAGE_SIZE + idx] : undefined;
      if (!area) return invalid('Invalid choice.', () => areaScreen(areas, page));
      if (s.data.purpose === 'risk') {
        const r = await deps.getRisk(area.id);
        const name = ascii(area.name, 24);
        return end(r
          ? `${name}: ${r.level} risk (est. ${Math.round(r.score)}/100). Estimate only, not a confirmed outbreak. Empty standing water weekly.`
          : `${name}: no risk estimate available yet. Empty standing water weekly.`);
      }
      s.data.areaId = area.id; s.data.areaName = area.name; s.state = 'LANDMARK';
      return cont('Nearby landmark? (optional)\nType it, or 0 to skip', s);
    }
    case 'LANDMARK': {
      if (text !== '0') { const lm = sanitizeLandmark(text); if (lm) s.data.landmark = lm; }
      s.state = 'CONFIRM';
      const lmLine = s.data.landmark ? `\nNear: ${s.data.landmark.slice(0, 30)}` : '';
      return cont(`Confirm report:\n${TYPE_LABEL[s.data.reportType!]}\nArea: ${ascii(s.data.areaName!, 24)}${lmLine}\n1.Yes+SMS updates\n2.Yes,no SMS\n3.Cancel`, s);
    }
    case 'CONFIRM': {
      if (text === '3') return end('Report cancelled.');
      if (text !== '1' && text !== '2') return invalid('Invalid choice.', () => '1.Yes+SMS updates\n2.Yes,no SMS\n3.Cancel');
      // idempotencyKey = AppLink sessionId: a retried confirm cannot create a second report.
      const { code } = await deps.submitReport({ idempotencyKey: s.sessionId, type: s.data.reportType!, areaId: s.data.areaId!, consentToUpdates: text === '1', ...(s.data.landmark ? { landmark: s.data.landmark } : {}) });
      return end(`Thank you. Report code: ${code}. Keep it to track your report.`);
    }
    case 'TRACK_CODE': {
      const m = /^DAI-(\d{4}-)?\d{3,6}$/i.exec(text);
      if (!m) return invalid('Invalid code.', () => 'Enter report code (e.g. DAI-2026-0001):');
      const r = await deps.getReportStatus(text.toUpperCase(), s.phoneHash);
      return end(r ? `${text.toUpperCase()}: ${STATUS_TEXT[r.status] ?? r.status}` : 'Report not found for this number.');
    }
  }
}
