import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApplinkClient, maskMsisdn, type LogEntry } from '../src/integrations/applink/applink.client.ts';
import { ApplinkError } from '../src/integrations/applink/applink.errors.ts';

// TEST DOUBLES ONLY: "OK" below is a placeholder success code chosen for the test, NOT an Applink value.
type Call = { url: string; init: RequestInit };
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function mk(fetchImpl: typeof fetch, over: Record<string, unknown> = {}) {
  const logs: LogEntry[] = [], calls: Call[] = [];
  const wrapped = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return fetchImpl(url, init); }) as unknown as typeof fetch;
  const c = new ApplinkClient({ baseUrl: 'https://example.invalid/', applicationId: 'APP_1', password: 'S3CRET-PW', successStatusCodes: ['OK'], fetchImpl: wrapped, log: (e) => logs.push(e), sleep: async () => {}, maxRetries: 2, ...over });
  return { c, logs, calls };
}
const code = async (p: Promise<unknown>) => { try { await p; return 'NO_ERROR'; } catch (e) { return `${(e as ApplinkError).kind}${(e as ApplinkError).statusCode ? ':' + (e as ApplinkError).statusCode : ''}`; } };

test('credentials go in the JSON body with the documented content type; nothing in headers or URL', async () => {
  const { c, calls } = mk(reply(200, { statusCode: 'OK', ref: 1 }));
  assert.deepEqual(await c.post('/x/y', { to: 'n' }), { statusCode: 'OK', ref: 1 });
  const { url, init } = calls[0]!; assert.equal(url, 'https://example.invalid/x/y');
  assert.deepEqual(JSON.parse(String(init.body)), { applicationId: 'APP_1', password: 'S3CRET-PW', to: 'n' });
  assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json;charset=utf-8');
  assert.ok(!JSON.stringify(init.headers).includes('S3CRET') && !url.includes('S3CRET'));
});
test('statusCode is checked on every response: HTTP 200 with a non-success or missing statusCode is an error', async () => {
  assert.equal(await code(mk(reply(200, { statusCode: 'E999' })).c.post('/p', {})), 'provider:E999');
  assert.equal(await code(mk(reply(200, { message: 'no code' })).c.post('/p', {})), 'provider');
  assert.equal(await code(mk(async () => new Response('not json', { status: 200 })).c.post('/p', {})), 'provider');
  assert.equal(await code(mk(reply(500, { statusCode: 'OK' })).c.post('/p', {})), 'provider:OK'); // HTTP failure wins
});
test('refuses to run without credentials or without configured success codes (no assumed code)', () => {
  assert.throws(() => new ApplinkClient({ baseUrl: 'x', applicationId: '', password: 'p', successStatusCodes: ['OK'] }), /credentials/);
  assert.throws(() => new ApplinkClient({ baseUrl: 'x', applicationId: 'a', password: 'p', successStatusCodes: [] }), /none is assumed/);
});
test('timeouts are reported as timeouts; network errors as network', async () => {
  const hang = (_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  assert.equal(await code(mk(hang as unknown as typeof fetch, { timeoutMs: 20 }).c.post('/p', {})), 'timeout');
  assert.equal(await code(mk((async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch).c.post('/p', {})), 'network');
});
test('retries ONLY idempotent calls and ONLY for timeout/network failures; provider rejections are never retried', async () => {
  let n = 0; const flaky = (async () => { n++; if (n < 3) throw new TypeError('down'); return new Response(JSON.stringify({ statusCode: 'OK' })); }) as unknown as typeof fetch;
  assert.deepEqual(await mk(flaky).c.post('/status', {}, { idempotent: true }), { statusCode: 'OK' }); assert.equal(n, 3);
  n = 0; assert.equal(await code(mk(flaky).c.post('/send', {})), 'network'); assert.equal(n, 1); // non-idempotent: single attempt (no duplicate SMS)
  const rej = mk(reply(200, { statusCode: 'E1' })); assert.equal(await code(rej.c.post('/p', {}, { idempotent: true })), 'provider:E1'); assert.equal(rej.calls.length, 1);
  n = 0; assert.equal(await code(mk((async () => { n++; throw new TypeError('x'); }) as unknown as typeof fetch).c.post('/p', {}, { idempotent: true })), 'network'); assert.equal(n, 3);
});
test('logs carry path, status and timing but never the password, OTP-like bodies or full phone numbers', async () => {
  const { c, logs } = mk(reply(200, { statusCode: 'OK', requestId: 'r-1' }), { extractRefs: (b: Record<string, unknown>) => ({ requestId: String(b.requestId) }) });
  await c.post('/sms/x', { to: '8801711000001', otp: '123456' }); await code(mk(reply(200, { statusCode: 'E1' }), { log: (e: LogEntry) => logs.push(e) }).c.post('/p', { to: '8801711000001' }));
  const dump = JSON.stringify(logs); assert.ok(!dump.includes('S3CRET') && !dump.includes('8801711000001') && !dump.includes('123456'));
  assert.deepEqual(logs[0]!.refs, { requestId: 'r-1' }); assert.equal(logs[0]!.outcome, 'ok'); assert.equal(logs[1]!.outcome, 'provider_error');
  assert.equal(maskMsisdn('8801711000001'), '*********0001');
});
