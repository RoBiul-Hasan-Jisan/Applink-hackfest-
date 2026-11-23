// Volunteer selection. Order per spec: area match -> availability -> nearest (only if BOTH have consented coords) -> workload.
import { haversineMeters, type GeoPoint } from './duplicate.ts';
export interface VolunteerCandidate {
  id: string; role: string; identityApproved: boolean; phoneVerified: boolean; isAvailable: boolean;
  areaIds: string[]; location?: GeoPoint | null; activeTasks: number;
}
export interface AssignmentInput { areaId: string; location?: GeoPoint | null }
export type AssignmentResult =
  | { volunteerId: string; reason: string }
  | { volunteerId: null; reason: 'NO_ELIGIBLE_VOLUNTEER' | 'ALL_AT_CAPACITY' };
export const DEFAULT_MAX_ACTIVE_TASKS = 5;

export function isEligible(v: VolunteerCandidate, areaId: string): boolean {
  return v.role === 'volunteer' && v.identityApproved && v.phoneVerified && v.isAvailable && v.areaIds.includes(areaId);
}

export function selectVolunteer(r: AssignmentInput, vols: VolunteerCandidate[], maxActive = DEFAULT_MAX_ACTIVE_TASKS): AssignmentResult {
  const eligible = vols.filter((v) => isEligible(v, r.areaId));
  if (eligible.length === 0) return { volunteerId: null, reason: 'NO_ELIGIBLE_VOLUNTEER' };
  const free = eligible.filter((v) => v.activeTasks < maxActive);
  if (free.length === 0) return { volunteerId: null, reason: 'ALL_AT_CAPACITY' };
  const dist = (v: VolunteerCandidate) => (r.location && v.location ? haversineMeters(r.location, v.location) : Infinity);
  const useDistance = !!r.location && free.some((v) => v.location);
  const ranked = [...free].sort((a, b) =>
    (useDistance ? dist(a) - dist(b) || 0 : 0) || a.activeTasks - b.activeTasks || a.id.localeCompare(b.id));
  const best = ranked[0]!;
  const why = useDistance && dist(best) !== Infinity ? `nearest eligible volunteer (${Math.round(dist(best))}m)` : `lowest workload in area (${best.activeTasks} active)`;
  return { volunteerId: best.id, reason: why };
}
