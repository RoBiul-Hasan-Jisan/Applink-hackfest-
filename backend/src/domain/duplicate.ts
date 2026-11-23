// Duplicate detection. Distance is used ONLY when both reports have consented coordinates; otherwise area+time.
import type { ReportType } from './priority.ts';
export interface GeoPoint { lng: number; lat: number }
export interface DupCandidate { areaId: string; type: ReportType; createdAt: Date; location?: GeoPoint | null }
export interface DupExisting extends DupCandidate { id: string; status: string; duplicateOf?: string | null }
export const DEFAULT_DUP = { radiusMeters: 300, windowHours: 24 };

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371008.8, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export interface DupMatch { originalId: string; basis: 'distance' | 'area_time'; distanceMeters?: number }

export function findDuplicate(c: DupCandidate, existing: DupExisting[], cfg = DEFAULT_DUP): DupMatch | null {
  const windowMs = cfg.windowHours * 3600_000;
  const matches = existing
    .filter((e) => e.status !== 'REJECTED' && !e.duplicateOf && e.areaId === c.areaId && e.type === c.type &&
      Math.abs(c.createdAt.getTime() - e.createdAt.getTime()) <= windowMs)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); // earliest original wins
  for (const e of matches) {
    if (c.location && e.location) {
      const d = haversineMeters(c.location, e.location);
      if (d <= cfg.radiusMeters) return { originalId: e.id, basis: 'distance', distanceMeters: Math.round(d) };
      continue; // both located but too far apart: not a duplicate
    }
    return { originalId: e.id, basis: 'area_time' };
  }
  return null;
}
