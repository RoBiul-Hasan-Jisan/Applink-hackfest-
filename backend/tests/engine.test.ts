import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ussdReport, approve, RES, RES2, VOL } from './helpers.ts';
import { EngineError } from '../src/domain/engine.ts';
import { WorkflowError } from '../src/domain/workflow.ts';
import { summary, responsePerformance, priorityDistribution } from '../src/domain/analytics.ts';

test('END-TO-END: USSD report -> HUMAN REVIEW -> auto-assign SMS -> accept -> clean -> verify -> resident reopens -> re-assigned', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); const coord = await e.mkUser('c1', 'coordinator', null);
  const end = await ussdReport(e);
  assert.equal(end.continueSession, false); assert.match(end.text, /DAI-2026-0001/);
  let r = (await e.store.getReportByCode('DAI-2026-0001'))!;
  assert.equal(r.status, 'NEW'); assert.equal(r.assignedTo, null); assert.equal(e.to(VOL).length, 0); // NOTHING dispatched before review
  assert.equal(r.riskLevelAtCreation, 'HIGH'); assert.ok(r.priorityReasons.length >= 5); assert.equal(r.landmark, 'near mosque'); assert.equal(r.evidenceCompleteness, 'PARTIAL');
  assert.match(e.to(RES)[0]!.body, /DAI-2026-0001 received/);
  r = await approve(e, 'DAI-2026-0001');
  assert.equal(r.status, 'ASSIGNED'); assert.equal(r.assignedTo, 'v1'); assert.match(e.to(VOL)[0]!.body, /ACCEPT DAI-2026-0001/);
  await e.inbound(VOL, 'accept dai-2026-0001'); assert.equal((await e.store.getReport(r.id))!.status, 'ACCEPTED');
  await e.inbound(VOL, 'DONE DAI-2026-0001'); assert.equal((await e.store.getReport(r.id))!.status, 'CLEANED');
  await e.engine.transition(r.id, 'verify', await e.engine.actorForUser(coord));
  assert.match(e.to(RES).at(-1)!.body, /Reply 1 = Yes, 2 = No/);
  await e.inbound(RES, '2');
  r = (await e.store.getReport(r.id))!;
  assert.equal(r.status, 'ASSIGNED'); assert.equal(r.residentConfirmed, false);
  assert.deepEqual(r.history.map((h) => h.to), ['NEW', 'APPROVED', 'ASSIGNED', 'ACCEPTED', 'CLEANED', 'VERIFIED', 'REOPENED', 'ASSIGNED']);
  assert.ok(r.history.every((h) => h.actorId && h.at)); assert.ok(r.priorityScore >= 50);
  assert.match(e.to(RES).at(-1)!.body, /reopened and escalated/);
  assert.ok((await e.store.listAudit(100)).some((a) => a.action === 'report.reopen'));
});

test('review gate over SMS: a volunteer cannot accept an unapproved report', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); await ussdReport(e);
  await e.inbound(VOL, 'ACCEPT DAI-2026-0001'); assert.equal((await e.store.getReportByCode('DAI-2026-0001'))!.status, 'NEW');
});

test('reviewer can reject; rejected reports never dispatch', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); const c = await e.mkUser('c1', 'coordinator', null); await ussdReport(e);
  const r = (await e.store.getReportByCode('DAI-2026-0001'))!;
  await assert.rejects(e.engine.transition(r.id, 'reject', await e.engine.actorForUser(c)), (x: WorkflowError) => x.code === 'REASON_REQUIRED');
  assert.equal((await e.engine.transition(r.id, 'reject', await e.engine.actorForUser(c), { reason: 'not a hazard' })).status, 'REJECTED'); assert.equal(e.to(VOL).length, 0);
});

test('resident reply 1 confirms resolution', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); const coord = await e.mkUser('c1', 'coordinator', null);
  await ussdReport(e); const r = await approve(e, 'DAI-2026-0001');
  await e.inbound(VOL, 'ACCEPT DAI-2026-0001'); await e.inbound(VOL, 'DONE DAI-2026-0001');
  await e.engine.transition(r.id, 'verify', await e.engine.actorForUser(coord)); await e.inbound(RES, '1');
  const after = (await e.store.getReport(r.id))!; assert.equal(after.residentConfirmed, true); assert.equal(after.status, 'VERIFIED');
});

test('USSD retries / double submit create exactly one report (idempotent on session id)', async () => {
  const e = setup(); await ussdReport(e, RES, 'SAME');
  const again = await e.engine.submitReport({ source: 'ussd', phone: RES, type: 'standing_water', areaId: 'A1', consentToUpdates: true, idempotencyKey: 'SAME' });
  assert.equal(again.deduplicated, true); assert.equal((await e.store.listReports()).length, 1);
});

test('daily phone limit is enforced (configurable) and surfaced over USSD', async () => {
  const e = setup({ dailyReportLimit: 2 });
  for (let i = 0; i < 2; i++) await e.engine.submitReport({ source: 'web', phone: RES, type: 'other', areaId: 'A2', consentToUpdates: false, idempotencyKey: `k${i}` });
  await assert.rejects(e.engine.submitReport({ source: 'web', phone: RES, type: 'other', areaId: 'A2', consentToUpdates: false, idempotencyKey: 'k3' }), (x: EngineError) => x.code === 'DAILY_LIMIT');
  assert.match((await ussdReport(e, RES, 'S9')).text, /Daily report limit/);
});

test('duplicate SUGGESTION: reviewer must decide; approving without confirming "not a duplicate" is refused; merge = reject', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); const c = await e.mkUser('c1', 'coordinator', null);
  await ussdReport(e, RES, 'S1'); await ussdReport(e, RES2, 'S2');
  const [r1, r2] = [(await e.store.getReportByCode('DAI-2026-0001'))!, (await e.store.getReportByCode('DAI-2026-0002'))!];
  assert.equal(r2.duplicateOf, r1.id); assert.ok(r2.careNotes.some((n) => /Possible duplicate/.test(n))); assert.match(e.to(RES2)[0]!.body, /similar to an existing report/);
  await assert.rejects(approve(e, 'DAI-2026-0002'), (x: EngineError) => x.code === 'DUPLICATE_UNRESOLVED');
  assert.equal((await approve(e, 'DAI-2026-0001')).status, 'ASSIGNED');
  assert.equal((await e.engine.transition(r2.id, 'reject', await e.engine.actorForUser(c), { reason: 'merged: duplicate of DAI-2026-0001' })).status, 'REJECTED');
  assert.equal(e.to(VOL).length, 1);
});
test('a reviewer who confirms "not a duplicate" clears the link and the report proceeds', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); await e.mkUser('v2', 'volunteer', '8801722000002');
  await ussdReport(e, RES, 'S1'); await ussdReport(e, RES2, 'S2');
  const r = await approve(e, 'DAI-2026-0002', true); assert.equal(r.duplicateOf, null); assert.equal(r.status, 'ASSIGNED');
});

test('no eligible volunteer after approval -> stays APPROVED in the coordinator queue and is audited', async () => {
  const e = setup(); await e.mkUser('v-unverified', 'volunteer', VOL, { phoneVerified: false }); await ussdReport(e);
  const r = await approve(e, 'DAI-2026-0001'); assert.equal(r.status, 'APPROVED'); assert.equal(r.assignedTo, null);
  assert.ok((await e.store.listAudit(50)).some((a) => a.action === 'report.queued_for_coordinator')); assert.ok(r.careNotes.some((n) => /no eligible volunteer/.test(n)));
});

test('SMS identity/ownership checks: strangers, non-assignees and demoted volunteers are refused', async () => {
  const e = setup(); const v = await e.mkUser('v1', 'volunteer', VOL); await e.mkUser('v2', 'volunteer', '8801722000002', { isAvailable: false });
  await ussdReport(e); const r = await approve(e, 'DAI-2026-0001'); assert.equal(r.assignedTo, 'v1');
  await e.inbound('8801799999999', 'ACCEPT DAI-2026-0001'); assert.equal((await e.store.getReport(r.id))!.status, 'ASSIGNED'); assert.match(e.to('8801799999999')[0]!.body, /not recognised/);
  await e.inbound('8801722000002', 'ACCEPT DAI-2026-0001'); assert.equal((await e.store.getReport(r.id))!.status, 'ASSIGNED');
  await e.inbound(RES2, 'STATUS DAI-2026-0001'); assert.match(e.to(RES2)[0]!.body, /not recognised/);
  await e.inbound(RES, 'ACCEPT DAI-2026-0001'); assert.equal((await e.store.getReport(r.id))!.status, 'ASSIGNED');
  v.phoneVerified = false; await e.store.saveUser(v);
  await e.inbound(VOL, 'ACCEPT DAI-2026-0001'); assert.equal((await e.store.getReport(r.id))!.status, 'ASSIGNED');
  await e.inbound(RES, 'STATUS DAI-2026-0001'); assert.match(e.to(RES).at(-1)!.body, /DAI-2026-0001 is ASSIGNED/);
});

test('inbound SMS replay (same provider message id) is processed once', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); await ussdReport(e); await approve(e, 'DAI-2026-0001');
  const m = { id: 'msg-1', from: VOL, text: 'ACCEPT DAI-2026-0001' };
  assert.equal((await e.engine.handleInboundSms(m)).handled, true); assert.equal((await e.engine.handleInboundSms(m)).kind, 'DUPLICATE_DELIVERY');
});

test('STOP opts out: reports kept, no further notifications or campaign alerts', async () => {
  const e = setup(); const coord = await e.mkUser('c1', 'coordinator', null); await ussdReport(e); await e.inbound(RES, 'STOP');
  const r = (await e.store.getReportByCode('DAI-2026-0001'))!; assert.equal(r.consentToUpdates, false); assert.equal(r.reporterPhoneEncrypted, null);
  assert.equal((await e.engine.sendAreaAlert({ areaId: 'A1', actor: await e.engine.actorForUser(coord) })).recipients, 0);
});

test('campaigns: opted-in only, no repeat within 24h, restricted to coordinator/admin', async () => {
  const e = setup(); const coord = await e.mkUser('c1', 'coordinator', null); const vol = await e.mkUser('v1', 'volunteer', VOL);
  await ussdReport(e, RES, 'S1', '1'); await ussdReport(e, RES2, 'S2', '2');
  const c1 = await e.engine.sendAreaAlert({ areaId: 'A1', actor: await e.engine.actorForUser(coord) });
  assert.deepEqual([c1.recipients, c1.skipped], [1, 0]); assert.match(e.to(RES).at(-1)!.body, /estimate, not a confirmed outbreak/); assert.equal(e.to(RES2).length, 0);
  const c2 = await e.engine.sendAreaAlert({ areaId: 'A1', actor: await e.engine.actorForUser(coord) }); assert.deepEqual([c2.recipients, c2.skipped], [0, 1]);
  await assert.rejects(e.engine.sendAreaAlert({ areaId: 'A1', actor: await e.engine.actorForUser(vol) }), (x: EngineError) => x.code === 'FORBIDDEN');
});

test('OTP: request alone never verifies; wrong code fails; correct code verifies; attempts are limited; no approval granted', async () => {
  const e = setup({ maxOtpAttempts: 3 }); const u = await e.mkUser('v9', 'volunteer', null, { phoneVerified: false, identityApproved: false });
  await e.engine.requestPhoneOtp(u.id, '01733000009'); assert.equal((await e.store.getUser(u.id))!.phoneVerified, false);
  await assert.rejects(e.engine.verifyPhoneOtp(u.id, '000000'), (x: EngineError) => x.code === 'OTP_FAILED');
  const ok = await e.engine.verifyPhoneOtp(u.id, e.gw.otp.lastOtpForDev.get('8801733000009')!); assert.equal(ok.phoneVerified, true); assert.equal(ok.identityApproved, false);
  await assert.rejects(e.engine.verifyPhoneOtp(u.id, '123456'), (x: EngineError) => x.code === 'OTP_NOT_REQUESTED');
  await e.engine.requestPhoneOtp(u.id, '01733000009');
  for (let i = 0; i < 3; i++) await assert.rejects(e.engine.verifyPhoneOtp(u.id, '111111'));
  await assert.rejects(e.engine.verifyPhoneOtp(u.id, e.gw.otp.lastOtpForDev.get('8801733000009')!), /too many attempts/);
});
test('OTP phone number cannot be claimed by two users', async () => {
  const e = setup(); await e.mkUser('a', 'volunteer', VOL); const b = await e.mkUser('b', 'volunteer', null);
  await assert.rejects(e.engine.requestPhoneOtp(b.id, '01722000001'), (x: EngineError) => x.code === 'PHONE_IN_USE');
});

test('SMS REPORT command creates a report awaiting review; unknown area helps; unknown text replies help once/day', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); await e.inbound(RES, 'REPORT WATER Khulshi near City Mall');
  const r = (await e.store.getReportByCode('DAI-2026-0001'))!; assert.equal(r.source, 'sms'); assert.equal(r.landmark, 'City Mall'); assert.equal(r.status, 'NEW');
  await e.inbound(RES2, 'REPORT WATER Nowhereville'); assert.match(e.to(RES2)[0]!.body, /Area not recognised/);
  await e.inbound(RES2, 'hello'); await e.inbound(RES2, 'hello again'); assert.equal(e.to(RES2).filter((m) => /To report/.test(m.body)).length, 1);
});

test('SMS gateway failure never blocks the workflow and is logged as failed', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); e.gw.sms.send = async () => { throw new Error('provider down'); };
  await ussdReport(e); const r = await approve(e, 'DAI-2026-0001');
  assert.equal(r.status, 'ASSIGNED'); assert.ok(e.store.messages.length >= 2 && e.store.messages.every((m) => m.status === 'failed'));
});

test('volunteer decline re-routes to another volunteer; reminders sent once', async () => {
  const e = setup(); const v1 = await e.mkUser('v1', 'volunteer', VOL); await e.mkUser('v2', 'volunteer', '8801722000002');
  await ussdReport(e); const r = await approve(e, 'DAI-2026-0001'); assert.equal(r.assignedTo, 'v1');
  e.clock.t = new Date(e.clock.t.getTime() + 3 * 3600_000);
  assert.equal(await e.engine.sendReminders(), 1); assert.equal(await e.engine.sendReminders(), 0);
  const after = await e.engine.transition(r.id, 'decline', await e.engine.actorForUser(v1), { reason: 'travelling' });
  assert.equal(after.assignedTo, 'v2'); assert.equal(after.status, 'ASSIGNED');
});

test('concurrent conflicting transitions: second writer loses (compare-and-set)', async () => {
  const e = setup(); const v1 = await e.mkUser('v1', 'volunteer', VOL); await ussdReport(e); const r = await approve(e, 'DAI-2026-0001'); const a = await e.engine.actorForUser(v1);
  const results = await Promise.allSettled([e.engine.transition(r.id, 'accept', a), e.engine.transition(r.id, 'accept', a)]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
});

test('manual assignment requires an approved, phone-verified volunteer, and only after review', async () => {
  const e = setup(); const coord = await e.mkUser('c1', 'coordinator', null); await e.mkUser('bad', 'volunteer', null, { phoneVerified: false }); await ussdReport(e);
  const r = (await e.store.getReportByCode('DAI-2026-0001'))!; const ca = await e.engine.actorForUser(coord);
  await assert.rejects(e.engine.transition(r.id, 'assign', ca, { assigneeId: 'bad' }), (x: EngineError) => x.code === 'INVALID_ASSIGNEE');
  await e.mkUser('good', 'volunteer', VOL, { areaIds: [] });
  await assert.rejects(e.engine.transition(r.id, 'assign', ca, { assigneeId: 'good' }), (x: WorkflowError) => x.code === 'INVALID_TRANSITION'); // not reviewed yet
  await approve(e, 'DAI-2026-0001'); // no in-area volunteer -> coordinator queue
  assert.equal((await e.engine.transition(r.id, 'assign', ca, { assigneeId: 'good' })).assignedTo, 'good');
});

test('priority: unvalidated risk is shown but never drives the score; validated risk does; reviewer can override with a reason', async () => {
  const e = setup(); const c = await e.mkUser('c1', 'coordinator', null); await ussdReport(e);
  const r1 = (await e.store.getReportByCode('DAI-2026-0001'))!;
  assert.match(r1.priorityReasons[0]!, /not used: no validated estimate/); assert.equal(r1.riskLevelAtCreation, 'HIGH');
  e.store.risks[0]!.evaluationStatus = 'validated';
  const r2 = (await e.engine.submitReport({ source: 'web', phone: RES2, type: 'standing_water', areaId: 'A1', consentToUpdates: false, idempotencyKey: 'v-risk' })).report;
  assert.match(r2.priorityReasons[0]!, /Validated area risk estimate 80/); assert.ok(r2.priorityScore > r1.priorityScore);
  const ca = await e.engine.actorForUser(c);
  await assert.rejects(e.engine.overridePriority(r1.id, ca, { category: 'CRITICAL', reason: '' }), (x: WorkflowError) => x.code === 'REASON_REQUIRED');
  const o = await e.engine.overridePriority(r1.id, ca, { category: 'CRITICAL', reason: 'next to school water tank' });
  assert.equal(o.priorityCategory, 'CRITICAL'); assert.equal(o.priorityOverride!.by, 'c1'); assert.ok(o.priorityReasons.at(-1)!.includes('Reviewer override'));
  await assert.rejects(e.engine.overridePriority(r1.id, { id: 'x', role: 'volunteer' }, { category: 'LOW', reason: 'abc' }), (x: EngineError) => x.code === 'FORBIDDEN');
});

test('evidence: only the assigned approved volunteer or staff may attach; checksum is audited', async () => {
  const e = setup(); const v1 = await e.mkUser('v1', 'volunteer', VOL); const v2 = await e.mkUser('v2', 'volunteer', '8801722000002', { isAvailable: false });
  await ussdReport(e); const r = await approve(e, 'DAI-2026-0001');
  const ref = { id: 'ev1', sha256: 'a'.repeat(64), mime: 'image/jpeg', bytes: 10, kind: 'action' as const, uploadedAt: e.clock.t, uploadedBy: 'v1' };
  const after = await e.engine.addEvidence(r.id, await e.engine.actorForUser(v1), ref); assert.equal(after.evidence.length, 1);
  await assert.rejects(e.engine.addEvidence(r.id, await e.engine.actorForUser(v2), ref), (x: EngineError) => x.code === 'FORBIDDEN');
  assert.ok((await e.store.listAudit(50)).some((a) => a.action === 'report.evidence_added'));
});

test('telecom honesty: provider ACCEPTANCE is not DELIVERY; only a delivery report sets DELIVERED', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); await ussdReport(e);
  let s = await e.store.messageStats(); assert.equal(s.delivered, 0); assert.equal(s.accepted, 1); assert.equal(s.deliveryUnconfirmed, 1);
  const id = e.store.messages[0]!.providerMessageId!;
  assert.equal(await e.engine.recordDeliveryReport({ providerMessageId: id, status: 'delivered' }), true);
  assert.equal(await e.engine.recordDeliveryReport({ providerMessageId: 'unknown', status: 'delivered' }), false);
  s = await e.store.messageStats(); assert.deepEqual([s.accepted, s.delivered, s.deliveryUnconfirmed], [1, 1, 0]);
});

test('analytics: summary, SLA and priority distribution reflect real workflow history', async () => {
  const e = setup(); await e.mkUser('v1', 'volunteer', VOL); const coord = await e.mkUser('c1', 'coordinator', null);
  await ussdReport(e); const r = await approve(e, 'DAI-2026-0001');
  e.clock.t = new Date(e.clock.t.getTime() + 2 * 3600_000); await e.inbound(VOL, 'ACCEPT DAI-2026-0001');
  e.clock.t = new Date(e.clock.t.getTime() + 3600_000); await e.inbound(VOL, 'DONE DAI-2026-0001');
  e.clock.t = new Date(e.clock.t.getTime() + 3600_000); await e.engine.transition(r.id, 'verify', await e.engine.actorForUser(coord));
  const all = await e.store.listReports(); const s = summary(all, await e.store.listUsers());
  assert.equal(s.totalReports, 1); assert.equal(s.resolved, 1); assert.equal(s.unresolved, 0); assert.equal(s.avgResponseHours, 2); assert.equal(s.resolutionRate, 100); assert.equal(s.activeVolunteers, 1);
  const p = responsePerformance(all, 72); assert.equal(p.avgHoursToVerify, 4); assert.equal(p.slaCompliancePct, 100); assert.equal(p.reopenedCases, 0);
  assert.equal(Object.values(priorityDistribution(all)).reduce((a, b) => a + b, 0), 1);
});
