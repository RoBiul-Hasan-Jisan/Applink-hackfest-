import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApplinkClient } from '../src/integrations/applink/applink.client.ts';
import { ApplinkError } from '../src/integrations/applink/applink.errors.ts';
import { LiveSmsGateway } from '../src/integrations/applink/sms.adapter.ts';
import { LiveOtpGateway } from '../src/integrations/applink/otp.adapter.ts';
import { LiveUssdGateway } from '../src/integrations/applink/ussd.adapter.ts';
import { handleDeliveryReport, handleSmsReceive, handleUssdReceive, type CallbackDeps } from '../src/integrations/applink/callbacks.ts';
import type { UssdGateway } from '../src/integrations/applink/gateway.ts';
import { setup, approve, RES, VOL } from './helpers.ts';

// Fake HTTP that returns bodies shaped EXACTLY like the documented Applink examples (dev.applink.com.bd/docs/{sms,otp,ussd}).
type Sent = { url: string; body: Record<string, unknown> };
function fake(responder: (path: string, body: Record<string, unknown>) => unknown) {
  const sent: Sent[] = [];
  const f = (async (url: string, init: RequestInit) => { const path = new URL(url).pathname, body = JSON.parse(String(init.body)); sent.push({ url, body }); return new Response(JSON.stringify(responder(path, body))); }) as unknown as typeof fetch;
  const client = new ApplinkClient({ baseUrl: 'https://api.applink.com.bd', applicationId: 'APP_000001', password: 'pw', successStatusCodes: ['S1000'], fetchImpl: f, sleep: async () => {} });
  return { client, sent };
}
const smsOk = { version: '1.0', requestId: '101901031657410007', destinationResponses: [{ timeStamp: '20190103165801', address: 'tel:8801711000001', messageId: '101901031657410007', statusCode: 'S1000', statusDetail: 'Success' }], statusCode: 'S1000', statusDetail: 'Success.' };

test('SMS send uses the documented fields, asks for a delivery report, and returns message/request ids', async () => {
  const { client, sent } = fake(() => smsOk); const g = new LiveSmsGateway(client);
  assert.deepEqual(await g.send({ to: '8801711000001', body: 'Hello', idempotencyKey: 'k1' }), { providerMessageId: '101901031657410007', providerRequestId: '101901031657410007' });
  assert.equal(sent[0]!.url, 'https://api.applink.com.bd/sms/send');
  assert.deepEqual(sent[0]!.body, { applicationId: 'APP_000001', password: 'pw', version: '1.0', message: 'Hello', destinationAddresses: ['tel:8801711000001'], deliveryStatusRequest: '1' });
});
test('SMS: tel style and optional sender id are configurable; the same logical message is never sent twice', async () => {
  const { client, sent } = fake(() => smsOk); const g = new LiveSmsGateway(client, { style: 'plus', sourceAddress: '77000' });
  await g.send({ to: '8801711000001', body: 'A', idempotencyKey: 'dup' }); await g.send({ to: '8801711000001', body: 'A', idempotencyKey: 'dup' });
  assert.equal(sent.length, 1); assert.equal((sent[0]!.body.destinationAddresses as string[])[0], 'tel:+8801711000001'); assert.equal(sent[0]!.body.sourceAddress, '77000');
});
test('SMS: top-level S1000 is not enough: a rejected destination is an error; provider errors carry their statusCode', async () => {
  const rejected = { ...smsOk, destinationResponses: [{ ...smsOk.destinationResponses[0]!, statusCode: 'E1342', statusDetail: 'MSISDN is black listed' }] };
  await assert.rejects(new LiveSmsGateway(fake(() => rejected).client).send({ to: '8801711000001', body: 'x', idempotencyKey: 'a' }), (e: ApplinkError) => e.kind === 'provider' && e.statusCode === 'E1342');
  await assert.rejects(new LiveSmsGateway(fake(() => ({ statusCode: 'E1303', statusDetail: 'IP not provisioned' })).client).send({ to: '8801711000001', body: 'x', idempotencyKey: 'b' }), (e: ApplinkError) => e.statusCode === 'E1303');
});
test('OTP: request sends tel:8801... and returns referenceNo with a 5 minute expiry', async () => {
  const { client, sent } = fake(() => ({ version: '1.0', statusCode: 'S1000', referenceNo: '213561321321613', statusDetail: 'Success' })); const t0 = Date.now();
  const r = await new LiveOtpGateway(client).request('8801711000001');
  assert.equal(r.referenceNo, '213561321321613'); assert.ok(Math.abs(r.expiresAt.getTime() - (t0 + 300_000)) < 2000);
  assert.deepEqual(sent[0]!.body, { applicationId: 'APP_000001', password: 'pw', subscriberId: 'tel:8801711000001' });
});
test('OTP: verified ONLY on S1000; wrong/expired/unknown reference are false; system errors throw (never "verified")', async () => {
  const v = (code: string) => new LiveOtpGateway(fake(() => ({ statusCode: code, statusDetail: 'x', subscriptionStatus: 'REGISTERED' })).client).verify('213', '123564');
  assert.equal(await v('S1000'), true);
  for (const c of ['E1850', 'E1851', 'E1855']) assert.equal(await v(c), false);
  for (const c of ['E1603', 'E1313', 'E1856']) await assert.rejects(v(c), (e: ApplinkError) => e.statusCode === c);
  const { client, sent } = fake(() => ({ statusCode: 'S1000' })); await new LiveOtpGateway(client).verify('R1', '999999');
  assert.deepEqual(sent[0]!.body, { applicationId: 'APP_000001', password: 'pw', referenceNo: 'R1', otp: '999999' });
  await assert.rejects(new LiveOtpGateway(fake(() => ({ statusCode: 'S1000' })).client).request('8801711000001'), /no referenceNo/);
});
test('USSD send: mt-cont vs mt-fin, encoding 440, plain ASCII only', async () => {
  const { client, sent } = fake(() => ({ version: '1.0', requestId: 'r1', timeStamp: '20190103165801', statusCode: 'S1000', statusDetail: 'Success.' })); const g = new LiveUssdGateway(client);
  await g.send({ sessionId: '1330929317043', to: 'tel:+8801711000001', message: 'Menu\n1.A', end: false }); await g.send({ sessionId: '1330929317043', to: 'tel:+8801711000001', message: 'Bye', end: true });
  assert.deepEqual(sent[0]!.body, { applicationId: 'APP_000001', password: 'pw', version: '1.0', message: 'Menu\n1.A', sessionId: '1330929317043', ussdOperation: 'mt-cont', destinationAddress: 'tel:+8801711000001', encoding: '440' });
  assert.equal(sent[1]!.body.ussdOperation, 'mt-fin');
  await assert.rejects(g.send({ sessionId: 's', to: 'tel:+8801711000001', message: 'বাংলা', end: true }), /ASCII/); assert.equal(sent.length, 2);
});

// ---- callbacks (AppLink -> us) ----
function harness() {
  const e = setup(), pending: Promise<void>[] = [], ussdSent: { sessionId: string; to: string; message: string; end: boolean }[] = [];
  const ussd: UssdGateway = { send: async (m) => { ussdSent.push(m); return { requestId: 'x' }; } };
  const deps: CallbackDeps = { applicationId: 'APP_000029', store: e.store, engine: e.engine, ussd, schedule: (fn) => { pending.push(fn()); } };
  return { e, deps, ussdSent, flush: () => Promise.all(pending) };
}
const dial = (o: Record<string, unknown>) => ({ version: '1.0', applicationId: 'APP_000029', message: '*141#', requestId: 'R0', sessionId: '1330929317043', ussdOperation: 'mo-init', sourceAddress: 'tel:+8801711000001', vlrAddress: 'tel:+8801711000001', encoding: '440', ...o });

test('USSD callback: acknowledges, then replies via /ussd/send; full report flow over documented payloads; retries are not re-processed', async () => {
  const h = harness(); const n = { i: 0 }; const turn = async (msg: string, op = 'mo-cont') => { const r = await handleUssdReceive(dial({ message: msg, ussdOperation: op, requestId: `R${++n.i}` }), h.deps); await h.flush(); return r; };
  const first = await turn('*141#', 'mo-init'); assert.deepEqual(first, { http: 200, body: { statusCode: 'S1000', statusDetail: 'Success.' } });
  assert.match(h.ussdSent[0]!.message, /^DengueZero/); assert.equal(h.ussdSent[0]!.end, false); assert.equal(h.ussdSent[0]!.to, 'tel:+8801711000001'); assert.equal(h.ussdSent[0]!.sessionId, '1330929317043');
  for (const m of ['1', '1', 'near mosque', '1']) await turn(m);
  const last = h.ussdSent.at(-1)!; assert.equal(last.end, true); assert.match(last.message, /DAI-2026-0001/);
  const rep = (await h.e.store.getReportByCode('DAI-2026-0001'))!; assert.equal(rep.source, 'ussd'); assert.equal(rep.status, 'NEW'); assert.equal(rep.areaId, 'A1');
  const before = h.ussdSent.length; await handleUssdReceive(dial({ message: '1', requestId: 'R2' }), h.deps); await h.flush(); assert.equal(h.ussdSent.length, before); // replayed requestId
  assert.ok(h.ussdSent.every((s) => s.message.length <= 160 && /^[\x20-\x7E\n]*$/.test(s.message)));
});
test('USSD callback: a new dial (mo-init) restarts at the menu even if a stale session exists; wrong applicationId and bad payloads are rejected', async () => {
  const h = harness(); await handleUssdReceive(dial({ requestId: 'A1' }), h.deps); await handleUssdReceive(dial({ ussdOperation: 'mo-cont', message: '1', requestId: 'A2' }), h.deps); await h.flush();
  await handleUssdReceive(dial({ requestId: 'A3' }), h.deps); await h.flush(); assert.match(h.ussdSent.at(-1)!.message, /^DengueZero/);
  const wrongApp = await handleUssdReceive(dial({ applicationId: 'APP_OTHER', requestId: 'B1' }), h.deps); assert.equal(wrongApp.http, 403); assert.equal(wrongApp.body.statusCode, 'E1313');
  const invalid = await handleUssdReceive({ foo: 'bar' }, h.deps); assert.equal(invalid.http, 400); assert.equal(invalid.body.statusCode, 'E1312');
  const sentBefore = h.ussdSent.length; await handleUssdReceive(dial({ ussdOperation: 'mt-fin', requestId: 'C1' }), h.deps); await h.flush(); assert.equal(h.ussdSent.length, sentBefore); // not subscriber-originated
});
test('inbound SMS callback: documented body drives the same engine (REPORT, replay-safe); non-text encodings and wrong app are ignored/rejected', async () => {
  const h = harness(); const body = { version: '1.0', applicationId: 'APP_000029', sourceAddress: 'tel:+8801711000001', message: 'REPORT WATER Khulshi near mall', requestId: 'Q1', encoding: '0' };
  assert.equal((await handleSmsReceive(body, h.deps)).body.statusCode, 'S1000'); await h.flush();
  assert.equal((await h.e.store.getReportByCode('DAI-2026-0001'))!.landmark, 'mall');
  await handleSmsReceive(body, h.deps); await h.flush(); assert.equal((await h.e.store.listReports()).length, 1); // replay
  await handleSmsReceive({ ...body, requestId: 'Q2', encoding: '245', message: 'REPORT WATER Khulshi' }, h.deps); await h.flush(); assert.equal((await h.e.store.listReports()).length, 1);
  assert.equal((await handleSmsReceive({ ...body, applicationId: 'APP_X', requestId: 'Q3' }, h.deps)).http, 403); assert.equal((await handleSmsReceive({ nope: 1 }, h.deps)).http, 400);
});
test('inbound SMS callback from a volunteer drives the workflow (ACCEPT after review)', async () => {
  const h = harness(); await h.e.mkUser('v1', 'volunteer', VOL); await h.e.engine.submitReport({ source: 'web', phone: RES, type: 'standing_water', areaId: 'A1', consentToUpdates: true, idempotencyKey: 'w1' });
  await approve(h.e, 'DAI-2026-0001');
  await handleSmsReceive({ applicationId: 'APP_000029', sourceAddress: 'tel:+8801722000001', message: 'ACCEPT DAI-2026-0001', requestId: 'V1', encoding: '0' }, h.deps); await h.flush();
  assert.equal((await h.e.store.getReportByCode('DAI-2026-0001'))!.status, 'ACCEPTED');
});
test('delivery report callback: only a report marks DELIVERED (matched by id); duplicates/unknown ids are acknowledged; bad payloads rejected', async () => {
  const h = harness(); await h.e.engine.submitReport({ source: 'web', phone: RES, type: 'other', areaId: 'A2', consentToUpdates: true, idempotencyKey: 'd1' });
  assert.equal((await h.e.store.messageStats()).delivered, 0);
  const id = h.e.store.messages[0]!.providerMessageId!, rpt = { destinationAddress: 'tel:+8801711000001', timeStamp: '2611221010', requestId: id, deliveryStatus: 'DELIVERED' };
  assert.deepEqual((await handleDeliveryReport(rpt, h.deps)).body, { statusCode: 'S1000', statusDetail: 'Success.' }); assert.equal((await h.e.store.messageStats()).delivered, 1);
  assert.equal((await handleDeliveryReport(rpt, h.deps)).http, 200); assert.equal((await h.e.store.messageStats()).delivered, 1);
  assert.equal((await handleDeliveryReport({ ...rpt, requestId: 'unknown-id' }, h.deps)).http, 200);
  assert.equal((await handleDeliveryReport({ ...rpt, deliveryStatus: 'WHATEVER' }, h.deps)).http, 400);
  const id2 = h.e.store.messages[0]!.providerMessageId!; await handleDeliveryReport({ ...rpt, requestId: id2, deliveryStatus: 'UNDELIVERABLE' }, h.deps); assert.equal(h.e.store.messages[0]!.deliveryStatus, 'UNDELIVERABLE'); assert.equal((await h.e.store.messageStats()).delivered, 0);
});
