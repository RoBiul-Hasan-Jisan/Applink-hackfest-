// Phone handling: canonical normalization, keyed HMAC lookup hash, AES-256-GCM recoverable encryption, log masking.
// NOTE: canonical form here is internal (8801XXXXXXXXX). The format AppLink expects for MSISDNs is NOT assumed here;
// conversion belongs to the AppLink adapters once confirmed (see docs/APPLINK_OPEN_QUESTIONS.md).
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export function normalizeBdPhone(raw: string): string | null {
  let d = raw.replace(/[\s\-()]/g, '').replace(/^tel:/i, '').replace(/^\+/, '');
  if (/^01\d{9}$/.test(d)) d = '880' + d.slice(1);
  return /^8801[3-9]\d{8}$/.test(d) ? d : null;
}
export function hashPhone(canonical: string, secret: string): string {
  if (secret.length < 16) throw new Error('PHONE_HASH_SECRET too short');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}
const keyFrom = (b64: string): Buffer => {
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error('PHONE_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return k;
};
export function encryptPhone(canonical: string, keyB64: string): string {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', keyFrom(keyB64), iv);
  const ct = Buffer.concat([c.update(canonical, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}
export function decryptPhone(payload: string, keyB64: string): string {
  const [iv, tag, ct] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !ct) throw new Error('malformed ciphertext');
  const d = createDecipheriv('aes-256-gcm', keyFrom(keyB64), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
export const last4 = (canonical: string): string => canonical.slice(-4);
export const maskPhone = (canonical: string): string => `***${last4(canonical)}`;
