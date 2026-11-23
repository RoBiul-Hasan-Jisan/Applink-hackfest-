export class ApplinkError extends Error {
  kind: 'provider' | 'timeout' | 'network' | 'disabled';
  statusCode?: string; // provider body statusCode (must be checked on every response, not just HTTP status)
  constructor(kind: ApplinkError['kind'], message: string, statusCode?: string) {
    super(message); this.name = 'ApplinkError'; this.kind = kind;
    if (statusCode !== undefined) this.statusCode = statusCode;
  }
}
