import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { Engine } from '../domain/engine.ts';
import { EngineError } from '../domain/engine.ts';
import { WorkflowError, type Actor } from '../domain/workflow.ts';
import type { Store, ReportRec } from '../domain/types.ts';
import type { Gateways } from '../integrations/applink/gateway.ts';
import { getFirebaseAuth } from '../config/firebase.ts';
import { sanitizeImage, ImageError } from '../domain/image-sanitize.ts';
import type { EvidenceStorage } from '../integrations/storage.ts';
import type { EvidenceRef } from '../domain/types.ts';

export interface Ctx { store: Store; engine: Engine; gw: Gateways; storage: EvidenceStorage; mode: 'simulator' | 'sandbox' | 'live'; slaHours: number; smsLanguage: string }
export const ah = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  void _next;
  if (err instanceof ZodError) { res.status(400).json({ error: 'validation_failed', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }); return; }
  if (err instanceof WorkflowError) { res.status(err.code === 'INVALID_TRANSITION' ? 409 : 403).json({ error: err.code, message: err.message }); return; }
  if (err instanceof EngineError) {
    const m: Record<string, number> = { NOT_FOUND: 404, AREA_NOT_FOUND: 404, DAILY_LIMIT: 429, CONFLICT: 409, INVALID_PHONE: 400, INVALID_ASSIGNEE: 400, OTP_FAILED: 400, OTP_NOT_REQUESTED: 400, PHONE_IN_USE: 409, FORBIDDEN: 403, DUPLICATE_UNRESOLVED: 409, EVIDENCE_REJECTED: 400 };
    res.status(m[err.code] ?? 400).json({ error: err.code, message: err.message }); return;
  }
  console.error('unhandled error', err instanceof Error ? err.message : err); // never log request bodies (phones/OTP)
  res.status(500).json({ error: 'internal_error' });
}

/** Resolve the workflow actor for the authenticated caller. Volunteer eligibility flags come from the DB, not from the token. */
export async function actorFor(ctx: Ctx, req: Request): Promise<Actor> {
  const a = req.auth!;
  if (a.role === 'volunteer') {
    const u = await ctx.store.getUserByFirebaseUid(a.uid);
    if (!u) throw new EngineError('FORBIDDEN', 'no volunteer profile');
    return ctx.engine.actorForUser(u);
  }
  return { id: a.uid, role: a.role ?? 'resident' };
}

// Residents' identifiers never leave the API: only a masked last-4 is shown to staff.
export function serializeReport(r: ReportRec) {
  const { reporterPhoneEncrypted: _e, reporterPhoneHash: _h, idempotencyKey: _k, reporterPhoneLast4, ...rest } = r; void _e; void _h; void _k;
  return { ...rest, reporter: `***${reporterPhoneLast4}` };
}
/** Validate, strip metadata (EXIF/GPS), checksum and store a photo privately. Returns a reference; never the file path. */
export async function storeEvidence(ctx: Ctx, base64: string, kind: EvidenceRef['kind'], uploadedBy: string): Promise<EvidenceRef> {
  try {
    const s = sanitizeImage(Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64'));
    const { id, sha256 } = await ctx.storage.put(s.data);
    return { id, sha256, mime: s.mime, bytes: s.data.length, kind, uploadedAt: new Date(), uploadedBy };
  } catch (e) { if (e instanceof ImageError) throw new EngineError('EVIDENCE_REJECTED', e.message); throw e; }
}
export async function syncClaims(uid: string, claims: Record<string, unknown> | null): Promise<void> { await getFirebaseAuth().setCustomUserClaims(uid, claims); }
