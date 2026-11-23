import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSms, normalizeReportCode } from '../src/domain/sms-parser.ts';
import { selectVolunteer, type VolunteerCandidate } from '../src/domain/assignment.ts';
import { normalizeBdPhone, hashPhone, encryptPhone, decryptPhone, maskPhone } from '../src/domain/phone-crypto.ts';
import { estimateCost, REPORT_FLOW, lifecycleUsage } from '../src/domain/cost.ts';
import { randomBytes } from 'node:crypto';

test('SMS commands, case/whitespace insensitive, short and long codes', () => {
  assert.deepEqual(parseSms('accept  dai-2026-0001 ', 2026), { kind: 'ACCEPT', code: 'DAI-2026-0001' });
  assert.deepEqual(parseSms('DONE DAI-1024', 2026), { kind: 'DONE', code: 'DAI-2026-1024' });
  assert.deepEqual(parseSms('STATUS DAI-7', 2026), { kind: 'UNKNOWN', hint: 'MISSING_CODE' }); // too short to be a valid code
  assert.deepEqual(parseSms('STATUS DAI-2026-0042', 2026), { kind: 'STATUS', code: 'DAI-2026-0042' });
});
test('SMS resident replies 1/2 (also Bangla digits) and opt-out; garbage is UNKNOWN', () => {
  assert.deepEqual(parseSms('1', 2026), { kind: 'CONFIRM', fixed: true });
  assert.deepEqual(parseSms('২', 2026), { kind: 'CONFIRM', fixed: false });
  assert.deepEqual(parseSms('2 DAI-2026-0003', 2026), { kind: 'CONFIRM', fixed: false, code: 'DAI-2026-0003' });
  assert.deepEqual(parseSms('stop', 2026), { kind: 'OPT_OUT' });
  assert.deepEqual(parseSms('ACCEPT', 2026), { kind: 'UNKNOWN', hint: 'MISSING_CODE' });
  for (const g of ['', 'hello', '3', '12', 'ACCEPTDAI-2026-0001']) assert.equal(parseSms(g, 2026).kind, 'UNKNOWN');
  assert.equal(normalizeReportCode('no code', 2026), null);
});

const V = (o: Partial<VolunteerCandidate>): VolunteerCandidate => ({ id: 'v', role: 'volunteer', identityApproved: true, phoneVerified: true, isAvailable: true, areaIds: ['A1'], activeTasks: 0, ...o });
test('assignment: eligibility filters', () => {
  const bad = [V({ id: 'a', identityApproved: false }), V({ id: 'b', phoneVerified: false }), V({ id: 'c', isAvailable: false }), V({ id: 'd', areaIds: ['A2'] }), V({ id: 'e', role: 'coordinator' })];
  assert.deepEqual(selectVolunteer({ areaId: 'A1' }, bad), { volunteerId: null, reason: 'NO_ELIGIBLE_VOLUNTEER' });
});
test('assignment: workload tie-break, then nearest when both have coordinates, capacity respected', () => {
  assert.equal(selectVolunteer({ areaId: 'A1' }, [V({ id: 'x', activeTasks: 3 }), V({ id: 'y', activeTasks: 1 })]).volunteerId, 'y');
  const loc = { lng: 91.8, lat: 22.3 };
  const r = selectVolunteer({ areaId: 'A1', location: loc }, [
    V({ id: 'far', location: { lng: 91.8, lat: 22.4 } }), V({ id: 'near', activeTasks: 4, location: { lng: 91.8, lat: 22.301 } }), V({ id: 'noloc' })]);
  assert.equal(r.volunteerId, 'near');
  assert.deepEqual(selectVolunteer({ areaId: 'A1' }, [V({ activeTasks: 5 })]), { volunteerId: null, reason: 'ALL_AT_CAPACITY' });
  assert.equal(selectVolunteer({ areaId: 'A1' }, [V({ id: 'b' }), V({ id: 'a' })]).volunteerId, 'a'); // deterministic
});

test('phone normalization, keyed hashing, encryption round trip, tamper detection, masking', () => {
  assert.equal(normalizeBdPhone('01712-345678'), '8801712345678');
  assert.equal(normalizeBdPhone('+8801712345678'), '8801712345678');
  assert.equal(normalizeBdPhone('tel:8801712345678'), '8801712345678');
  assert.equal(normalizeBdPhone('12345'), null);
  assert.equal(normalizeBdPhone('01212345678'), null);
  const h1 = hashPhone('8801712345678', 'secret-secret-secret'), h2 = hashPhone('8801712345678', 'other-secret-secret!');
  assert.notEqual(h1, h2); assert.equal(h1, hashPhone('8801712345678', 'secret-secret-secret'));
  const key = randomBytes(32).toString('base64');
  const enc = encryptPhone('8801712345678', key);
  assert.ok(!enc.includes('8801712345678'));
  assert.equal(decryptPhone(enc, key), '8801712345678');
  assert.notEqual(encryptPhone('8801712345678', key), enc); // random IV
  const parts = enc.split('.'); parts[2] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptPhone(parts.join('.'), key));
  assert.throws(() => decryptPhone(enc, randomBytes(32).toString('base64')));
  assert.equal(maskPhone('8801712345678'), '***5678');
});
test('cost estimator', () => {
  assert.equal(estimateCost(REPORT_FLOW), 12);
  assert.equal(estimateCost(lifecycleUsage()), 16);
  assert.equal(estimateCost({ ussdMenus: 1, sms: 1 }, { smsBdt: 3, ussdMenuBdt: 1 }), 4);
});
test('SMS REPORT command keeps original-case area text', () => {
  assert.deepEqual(parseSms('report water Khulshi near City Mall', 2026), { kind: 'REPORT', reportType: 'standing_water', rest: 'Khulshi near City Mall' });
  assert.equal(parseSms('REPORT HOTSPOT', 2026).kind, 'UNKNOWN');
});
