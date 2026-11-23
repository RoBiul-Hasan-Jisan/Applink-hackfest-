import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriority, categorize, DEFAULT_PRIORITY_CONFIG } from '../src/domain/priority.ts';
import { findDuplicate, haversineMeters, type DupExisting } from '../src/domain/duplicate.ts';

test('priority matches hand-computed value (40/30/20/10)', () => {
  // risk 80*.4=32 ; nearby 5/10=50*.3=15 ; age 36/72=50*.2=10 ; hotspot 100*.1=10 => 67
  const r = computePriority({ areaRiskScore: 80, nearbyOpenCount: 5, ageHours: 36, type: 'hotspot' });
  assert.equal(r.score, 67);
  assert.equal(r.category, 'HIGH');
  assert.equal(r.reasons.length, 5); assert.equal(r.ruleVersion, 'rules-v1');
});
test('components saturate at 100 and clamp negatives', () => {
  const r = computePriority({ areaRiskScore: 150, nearbyOpenCount: 99, ageHours: 9999, type: 'hotspot' });
  assert.equal(r.score, 100); assert.equal(r.category, 'CRITICAL');
  assert.equal(computePriority({ areaRiskScore: -5, nearbyOpenCount: -2, ageHours: -1, type: 'other' }).components.risk, 0);
});
test('no validated risk: area risk is excluded, weights redistributed (0.3/0.6, 0.2/0.6, 0.1/0.6), and the report says so', () => {
  const r = computePriority({ areaRiskScore: null, nearbyOpenCount: 6, ageHours: 36, type: 'hotspot' });
  assert.match(r.reasons[0]!, /not used: no validated estimate/);
  assert.equal(r.components.risk, null);
  assert.equal(r.score, 63.3); // 60*.5 + 50*.3333 + 100*.1667 = 30 + 16.67 + 16.67
  assert.equal(computePriority({ areaRiskScore: null, nearbyOpenCount: 0, ageHours: 0, type: 'other' }).score, 5);
});
test('reopened reports are escalated to the floor with an explanation', () => {
  const r = computePriority({ areaRiskScore: 0, nearbyOpenCount: 0, ageHours: 0, type: 'other', reopened: true });
  assert.equal(r.score, 50); assert.equal(r.category, 'HIGH'); assert.ok(r.reasons.some((x) => /Reopened/.test(x)));
});
test('category thresholds and invalid weights', () => {
  assert.deepEqual([24.9, 25, 49.9, 50, 74.9, 75].map(categorize), ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'CRITICAL']);
  assert.throws(() => computePriority({ areaRiskScore: 1, nearbyOpenCount: 0, ageHours: 0, type: 'other' },
    { ...DEFAULT_PRIORITY_CONFIG, weights: { risk: 0.5, nearby: 0.5, age: 0.5, type: 0.5 } }));
});

const T0 = new Date('2026-11-21T10:00:00Z');
const ex = (o: Partial<DupExisting>): DupExisting => ({ id: 'a', areaId: 'A1', type: 'standing_water', createdAt: T0, status: 'NEW', ...o });
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);

test('haversine sanity (~111km per degree latitude)', () => {
  const d = haversineMeters({ lng: 91.8, lat: 22.3 }, { lng: 91.8, lat: 23.3 });
  assert.ok(Math.abs(d - 111_195) < 300);
});
test('duplicate: area+time when no coordinates; never invents a distance', () => {
  const m = findDuplicate({ areaId: 'A1', type: 'standing_water', createdAt: at(5) }, [ex({})]);
  assert.deepEqual(m, { originalId: 'a', basis: 'area_time' });
});
test('duplicate: respects type, area, 24h window, rejected, and existing duplicates', () => {
  const c = { areaId: 'A1', type: 'standing_water' as const, createdAt: at(1) };
  assert.equal(findDuplicate({ ...c, type: 'drainage' }, [ex({})]), null);
  assert.equal(findDuplicate({ ...c, areaId: 'A2' }, [ex({})]), null);
  assert.equal(findDuplicate({ ...c, createdAt: at(25) }, [ex({})]), null);
  assert.equal(findDuplicate(c, [ex({ status: 'REJECTED' })]), null);
  assert.equal(findDuplicate(c, [ex({ duplicateOf: 'zzz' })]), null);
});
test('duplicate: 300m rule applies only when both have locations', () => {
  const p = { lng: 91.8, lat: 22.3 };
  const near = { lng: 91.8, lat: 22.3 + 0.002 }; // ~222m
  const far = { lng: 91.8, lat: 22.3 + 0.004 }; // ~445m
  const c = { areaId: 'A1', type: 'standing_water' as const, createdAt: at(1) };
  assert.equal(findDuplicate({ ...c, location: near }, [ex({ location: p })])?.basis, 'distance');
  assert.equal(findDuplicate({ ...c, location: far }, [ex({ location: p })]), null);
  assert.equal(findDuplicate({ ...c, location: far }, [ex({})])?.basis, 'area_time'); // one side unlocated
});
test('duplicate: earliest original wins', () => {
  const m = findDuplicate({ areaId: 'A1', type: 'standing_water', createdAt: at(2) }, [ex({ id: 'late', createdAt: at(1) }), ex({ id: 'early', createdAt: at(0) })]);
  assert.equal(m?.originalId, 'early');
});
