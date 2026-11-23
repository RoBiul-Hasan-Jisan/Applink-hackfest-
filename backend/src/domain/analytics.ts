// Pure analytics over report/volunteer records. Works on real data; seeded data is flagged isSynthetic upstream.
import type { ReportRec, UserRec } from './types.ts';
import { isOpen, type Status } from './workflow.ts';

const H = 3600_000;
const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const firstAt = (r: ReportRec, to: Status): Date | null => r.history.find((h) => h.to === to && h.action !== 'create')?.at ?? null;
const hoursBetween = (a: Date, b: Date | null): number | null => (b ? (b.getTime() - a.getTime()) / H : null);
const nums = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x !== null && x >= 0);
const primary = (rs: ReportRec[]) => rs.filter((r) => !r.duplicateOf);

export function summary(all: ReportRec[], vols: UserRec[]) {
  const rs = primary(all);
  const verified = rs.filter((r) => r.status === 'VERIFIED');
  const valid = rs.filter((r) => r.status !== 'REJECTED');
  return {
    totalReports: all.length, linkedDuplicates: all.length - rs.length,
    unresolved: rs.filter((r) => isOpen(r.status)).length, verifiedHotspots: verified.length,
    highPriority: rs.filter((r) => isOpen(r.status) && (r.priorityCategory === 'HIGH' || r.priorityCategory === 'CRITICAL')).length,
    activeVolunteers: vols.filter((v) => v.role === 'volunteer' && v.identityApproved && v.phoneVerified && v.isAvailable).length,
    resolved: verified.length,
    avgResponseHours: avg(nums(rs.map((r) => hoursBetween(r.createdAt, firstAt(r, 'ACCEPTED'))))),
    resolutionRate: valid.length ? Math.round((verified.length / valid.length) * 1000) / 10 : null,
  };
}
export function dailyReports(all: ReportRec[], days: number, now: Date) {
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * H).toISOString().slice(0, 10);
    out.push({ date: d, count: all.filter((r) => r.createdAt.toISOString().slice(0, 10) === d).length });
  }
  return out;
}
export function byArea(all: ReportRec[], names: Map<string, string>) {
  const m = new Map<string, { open: number; resolved: number }>();
  for (const r of primary(all)) {
    const e = m.get(r.areaId) ?? { open: 0, resolved: 0 }; if (isOpen(r.status)) e.open++; else if (r.status === 'VERIFIED') e.resolved++; m.set(r.areaId, e);
  }
  return [...m].map(([areaId, v]) => ({ areaId, area: names.get(areaId) ?? areaId, ...v })).sort((a, b) => b.open - a.open);
}
export function priorityDistribution(all: ReportRec[]) {
  const d = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const r of primary(all)) d[r.priorityCategory]++; return d;
}
export function responsePerformance(all: ReportRec[], slaHours = 72) {
  const rs = primary(all);
  const verified = rs.filter((r) => r.status === 'VERIFIED' || firstAt(r, 'VERIFIED'));
  const ttv = verified.map((r) => hoursBetween(r.createdAt, firstAt(r, 'VERIFIED')));
  const within = nums(ttv).filter((h) => h <= slaHours).length;
  const reopened = rs.filter((r) => r.history.some((h) => h.to === 'REOPENED')).length;
  return {
    slaHours, avgHoursToAssign: avg(nums(rs.map((r) => hoursBetween(r.createdAt, firstAt(r, 'ASSIGNED'))))),
    avgHoursToAccept: avg(nums(rs.map((r) => hoursBetween(r.createdAt, firstAt(r, 'ACCEPTED'))))),
    avgHoursToClean: avg(nums(rs.map((r) => hoursBetween(r.createdAt, firstAt(r, 'CLEANED'))))),
    avgHoursToVerify: avg(nums(ttv)),
    slaCompliancePct: nums(ttv).length ? Math.round((within / nums(ttv).length) * 1000) / 10 : null,
    reopenedCases: reopened, reopenRatePct: rs.length ? Math.round((reopened / rs.length) * 1000) / 10 : null,
  };
}
export function volunteerPerformance(all: ReportRec[], vols: UserRec[]) {
  return vols.filter((v) => v.role === 'volunteer').map((v) => ({
    volunteerId: v.id, name: v.name,
    completed: all.filter((r) => r.history.some((h) => h.action === 'clean' && h.actorId === v.id)).length,
    activeTasks: all.filter((r) => r.assignedTo === v.id && (r.status === 'ASSIGNED' || r.status === 'ACCEPTED')).length,
  }));
}
