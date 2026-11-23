import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ussdReport, approve, RES, RES2, VOL } from './helpers.ts';
import { parseSms } from '../src/domain/sms-parser.ts';
import { EngineError } from '../src/domain/engine.ts';
import { summary } from '../src/domain/analytics.ts';

const DAY = 86_400_000;
test('ERASE / DELETE MY DATA are parsed', () => { for (const t of ['erase', 'Delete data', 'DELETE MY DATA']) assert.deepEqual(parseSms(t, 2026), { kind: 'ERASE' }); });

test('retention: contacts of FINISHED reports are purged after N days; open reports keep theirs; hash kept for limits/ownership', async () => {
  const e = setup({ contactRetentionDays: 30 }); await e.mkUser('v1', 'volunteer', VOL); const c = await e.mkUser('c1', 'coordinator', null);
  await ussdReport(e, RES, 'S1'); await ussdReport(e, RES2, 'S2');
  const done = await approve(e, 'DAI-2026-0001'); await e.inbound(VOL, 'ACCEPT DAI-2026-0001'); await e.inbound(VOL, 'DONE DAI-2026-0001');
  await e.engine.transition(done.id, 'verify', await e.engine.actorForUser(c));
  e.clock.t = new Date(e.clock.t.getTime() + 29 * DAY); assert.equal(await e.engine.purgeExpiredContacts(), 0);
  e.clock.t = new Date(e.clock.t.getTime() + 2 * DAY); e.store.reports.get(done.id)!.updatedAt = new Date(e.clock.t.getTime() - 31 * DAY); // last change 31 days ago
  assert.equal(await e.engine.purgeExpiredContacts(), 1);
  const r1 = (await e.store.getReport(done.id))!, r2 = (await e.store.getReportByCode('DAI-2026-0002'))!;
  assert.equal(r1.reporterPhoneEncrypted, null); assert.equal(r1.consentToUpdates, false); assert.ok(r1.reporterPhoneHash.length > 20);
  assert.ok(r2.reporterPhoneEncrypted); assert.equal(r2.consentToUpdates, true); // still open: kept
  assert.ok((await e.store.listAudit(20)).some((a) => a.action === 'retention.contacts_purged'));
});

test('SMS ERASE wipes contact, hash linkage, resident photos and message history; others and analytics unaffected; confirmation not logged', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL);
  const { id, sha256 } = await e.storage.put(Buffer.from('photo-bytes'));
  const mine = (await e.engine.submitReport({ source: 'web', phone: RES, type: 'standing_water', areaId: 'A1', consentToUpdates: true, idempotencyKey: 'mine-1', evidence: [{ id, sha256, mime: 'image/jpeg', bytes: 11, kind: 'report', uploadedAt: e.clock.t, uploadedBy: 'resident-web' }] })).report;
  await e.engine.submitReport({ source: 'web', phone: RES2, type: 'drainage', areaId: 'A2', consentToUpdates: true, idempotencyKey: 'other-1' });
  assert.ok(e.store.messages.some((m) => m.relatedReportId === mine.id));
  const before = e.store.messages.length;
  await e.inbound(RES, 'ERASE');
  const after = (await e.store.getReport(mine.id))!;
  assert.equal(after.reporterPhoneEncrypted, null); assert.equal(after.consentToUpdates, false); assert.equal(after.reporterPhoneLast4, ''); assert.match(after.reporterPhoneHash, /^erased:/);
  assert.equal(after.evidence[0]!.deletedAt instanceof Date, true); assert.equal(await e.storage.get(id), null); assert.equal(after.evidence[0]!.sha256, sha256); // file gone, checksum record kept
  assert.ok(e.store.messages.length < before && e.store.messages.every((m) => m.relatedReportId !== mine.id));
  assert.ok(e.to(RES).some((m) => /erased/.test(m.body))); assert.equal(e.store.messages.filter((m) => m.template === 'erased').length, 0); // confirmation sent but not re-logged
  const other = (await e.store.getReportByCode('DAI-2026-0002'))!; assert.ok(other.reporterPhoneEncrypted); assert.equal(other.consentToUpdates, true);
  assert.equal(summary(await e.store.listReports(), []).totalReports, 2); // anonymous records still counted
  assert.ok((await e.store.listAudit(20)).some((a) => a.action === 'resident.erased'));
  await e.inbound(RES, 'STATUS ' + after.reportCode); assert.match(e.to(RES).at(-1)!.body, /not recognised/); // ownership link is gone
});

test('staff/volunteer numbers cannot be erased by SMS or by the admin API path', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL);
  await e.inbound(VOL, 'ERASE'); assert.ok((await e.store.getUser('v1'))!.phoneEncrypted); assert.match(e.to(VOL).at(-1)!.body, /not recognised/);
  await assert.rejects(e.engine.eraseResident(VOL), (x: EngineError) => x.code === 'FORBIDDEN');
  await assert.rejects(e.engine.eraseResident('12345'), (x: EngineError) => x.code === 'INVALID_PHONE');
});
