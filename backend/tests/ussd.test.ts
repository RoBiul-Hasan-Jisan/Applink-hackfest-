import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, type UssdDeps, type UssdSession, type UssdResult } from '../src/domain/ussd-machine.ts';

const NOW = Date.UTC(2026, 10, 21, 10, 0, 0);
const areas = Array.from({ length: 6 }, (_, i) => ({ id: `A${i + 1}`, name: `Area ${i + 1}` }));
const submitted: unknown[] = [];
const deps: UssdDeps = {
  listAreas: async () => areas,
  getRisk: async (id) => (id === 'A1' ? { level: 'HIGH', score: 78.4 } : null),
  getReportStatus: async (code, ph) => (code === 'DAI-2026-0001' && ph === 'me' ? { status: 'ASSIGNED' } : null),
  submitReport: async (d) => { submitted.push(d); return { code: 'DAI-2026-0009' }; },
};
const ctx = { sessionId: 'S1', phoneHash: 'me', now: NOW };
async function run(inputs: string[], deps_ = deps): Promise<UssdResult[]> {
  const out: UssdResult[] = []; let s: UssdSession | null = null;
  for (const i of inputs) { const r = await step(s, i, deps_, ctx); out.push(r); s = r.session; }
  return out;
}
const assertAsciiShort = (rs: UssdResult[]) => rs.forEach((r) => { assert.ok(r.text.length <= 160, `len ${r.text.length}: ${r.text}`); assert.match(r.text, /^[\x20-\x7E\n]*$/); });

test('first request shows main menu and continues', async () => {
  const [r] = await run(['']);
  assert.match(r!.text, /^DengueZero/); assert.equal(r!.continueSession, true); assertAsciiShort([r!]);
});
test('full report flow creates exactly one report with sessionId as idempotency key', async () => {
  submitted.length = 0;
  const rs = await run(['', '1', '2', 'Near the big mosque', '1']);
  assertAsciiShort(rs);
  assert.deepEqual(rs.map((r) => r.continueSession), [true, true, true, true, false]);
  assert.match(rs[4]!.text, /DAI-2026-0009/);
  assert.deepEqual(submitted, [{ idempotencyKey: 'S1', type: 'standing_water', areaId: 'A2', landmark: 'Near the big mosque', consentToUpdates: true }]);
});
test('landmark skip, cancel, hotspot type', async () => {
  submitted.length = 0;
  assert.equal((await run(['', '2', '1', '0', '3'])).at(-1)!.text, 'Report cancelled.');
  assert.equal(submitted.length, 0);
  await run(['', '2', '1', '0', '1']);
  assert.deepEqual(submitted, [{ idempotencyKey: 'S1', type: 'hotspot', areaId: 'A1', consentToUpdates: true }]);
  submitted.length = 0;
  await run(['', '1', '1', '0', '2']);
  assert.equal((submitted[0] as { consentToUpdates: boolean }).consentToUpdates, false);
});
test('area pagination: More/Prev, page-2 selection maps to the right area', async () => {
  const rs = await run(['', '1', '9']);
  assert.match(rs[2]!.text, /1\.Area 5\n2\.Area 6/); assert.match(rs[2]!.text, /8\.Prev/); assert.doesNotMatch(rs[2]!.text, /9\.More/);
  submitted.length = 0;
  await run(['', '1', '9', '2', '0', '1']);
  assert.equal((submitted[0] as { areaId: string }).areaId, 'A6');
  assert.match((await run(['', '1', '9', '8']))[3]!.text, /1\.Area 1/);
});
test('risk flow shows level, labels it an estimate, and ends; no-data case is honest', async () => {
  const hi = (await run(['', '3', '1'])).at(-1)!;
  assert.equal(hi.continueSession, false); assert.match(hi.text, /HIGH risk \(est\. 78\/100\)/); assert.match(hi.text, /not a confirmed outbreak/); assertAsciiShort([hi]);
  assert.match((await run(['', '3', '2'])).at(-1)!.text, /no risk estimate available/);
});
test('tracking: owner sees status; non-owner/unknown sees not found; bad format re-prompts', async () => {
  assert.match((await run(['', '5', 'dai-2026-0001'])).at(-1)!.text, /A volunteer has been assigned/);
  assert.match((await run(['', '5', 'DAI-2026-0002'])).at(-1)!.text, /not found for this number/);
  const bad = (await run(['', '5', 'hello'])).at(-1)!;
  assert.equal(bad.continueSession, true); assert.match(bad.text, /Invalid code/);
});
test('invalid input re-prompts, three strikes ends the session; 0 exits; tips end', async () => {
  const rs = await run(['', '9', '9', '9']);
  assert.deepEqual(rs.map((r) => r.continueSession), [true, true, true, false]); assertAsciiShort(rs);
  assert.equal((await run(['', '0'])).at(-1)!.continueSession, false);
  const tip = (await run(['', '4'])).at(-1)!; assert.equal(tip.continueSession, false); assert.match(tip.text, /^Tip: /);
});
test('expired session restarts at the menu instead of acting on stale state', async () => {
  const first = await step(null, '', deps, ctx);
  const stale = { ...first.session!, state: 'CONFIRM' as const, data: { reportType: 'hotspot' as const, areaId: 'A1', areaName: 'Area 1' }, expiresAt: NOW - 1 };
  submitted.length = 0;
  const r = await step(stale, '1', deps, ctx);
  assert.match(r.text, /^DengueZero/); assert.equal(submitted.length, 0);
});
test('landmark is sanitised to plain ASCII; empty areas ends gracefully', async () => {
  submitted.length = 0;
  await run(['', '1', '1', 'মসজিদ near\x00 school', '1']);
  assert.equal((submitted[0] as { landmark?: string }).landmark, 'near school');
  const r = (await run(['', '1'], { ...deps, listAreas: async () => [] })).at(-1)!;
  assert.equal(r.continueSession, false);
});
