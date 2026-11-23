// Shared Applink HTTP client. Encodes ONLY rules already fixed by the project brief:
//  - credentials (applicationId, password) travel in the JSON request body, server-side only
//  - content type application/json;charset=utf-8
//  - the response body `statusCode` is checked on EVERY call (HTTP 200 alone is not success)
//  - timeouts, provider errors and network errors are distinguished
//  - retries only for calls the caller marks idempotent, and only for timeout/network failures
//  - logs never contain the password, OTPs or full phone numbers
// Endpoint paths, request fields and response fields belong to the adapters, which are NOT written until the docs are confirmed.
import { ApplinkError } from './applink.errors.ts';

export interface LogEntry { path: string; httpStatus?: number; statusCode?: string; ms: number; attempt: number; outcome: 'ok' | 'provider_error' | 'timeout' | 'network_error'; refs?: Record<string, string> }
export interface ClientOptions {
  baseUrl: string; applicationId: string; password: string; successStatusCodes: string[]; timeoutMs?: number; maxRetries?: number; backoffMs?: number;
  fetchImpl?: typeof fetch; log?: (e: LogEntry) => void; sleep?: (ms: number) => Promise<void>;
  /** Pull provider request/message ids out of a response for logging, once their field names are confirmed. */
  extractRefs?: (body: Record<string, unknown>) => Record<string, string>;
}
export const maskMsisdn = (s: string): string => (s.length > 4 ? `${'*'.repeat(s.length - 4)}${s.slice(-4)}` : '****');

export class ApplinkClient {
  private o: Required<Pick<ClientOptions, 'timeoutMs' | 'maxRetries' | 'backoffMs'>> & ClientOptions;
  constructor(o: ClientOptions) {
    if (!o.applicationId || !o.password) throw new ApplinkError('disabled', 'Applink credentials are not configured');
    if (!o.successStatusCodes.length) throw new ApplinkError('disabled', 'APPLINK_SUCCESS_STATUS_CODES must list the documented success code(s); none is assumed');
    this.o = { timeoutMs: 10_000, maxRetries: 2, backoffMs: 300, ...o };
  }

  /** POST a JSON body. `idempotent` must be true only where a repeat cannot cause a duplicate effect (e.g. status lookups, polling). */
  async post<T extends Record<string, unknown>>(path: string, body: Record<string, unknown>, opts: { idempotent?: boolean } = {}): Promise<T> {
    const f = this.o.fetchImpl ?? fetch, sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const attempts = opts.idempotent ? this.o.maxRetries + 1 : 1; let last: ApplinkError | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const t0 = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), this.o.timeoutMs);
      try {
        const res = await f(`${this.o.baseUrl.replace(/\/$/, '')}${path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json;charset=utf-8' }, signal: ctl.signal,
          body: JSON.stringify({ applicationId: this.o.applicationId, password: this.o.password, ...body }),
        });
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const statusCode = json && json.statusCode !== undefined ? String(json.statusCode) : undefined;
        const ms = Date.now() - t0, refs = json && this.o.extractRefs ? this.o.extractRefs(json) : undefined;
        if (!res.ok || !json || statusCode === undefined || !this.o.successStatusCodes.includes(statusCode)) {
          this.o.log?.({ path, httpStatus: res.status, ...(statusCode ? { statusCode } : {}), ms, attempt, outcome: 'provider_error', ...(refs ? { refs } : {}) });
          // Provider rejections are final: retrying a rejected request is never assumed safe.
          throw new ApplinkError('provider', `Applink rejected ${path} (HTTP ${res.status}, statusCode ${statusCode ?? 'missing'})`, statusCode);
        }
        this.o.log?.({ path, httpStatus: res.status, statusCode, ms, attempt, outcome: 'ok', ...(refs ? { refs } : {}) });
        return json as T;
      } catch (e) {
        if (e instanceof ApplinkError) throw e;
        const timedOut = (e as Error).name === 'AbortError';
        this.o.log?.({ path, ms: Date.now() - t0, attempt, outcome: timedOut ? 'timeout' : 'network_error' });
        last = new ApplinkError(timedOut ? 'timeout' : 'network', timedOut ? `Applink ${path} timed out after ${this.o.timeoutMs}ms` : `Applink ${path} network error`);
        if (attempt < attempts) await sleep(this.o.backoffMs * 2 ** (attempt - 1));
      } finally { clearTimeout(timer); }
    }
    throw last!;
  }
}
