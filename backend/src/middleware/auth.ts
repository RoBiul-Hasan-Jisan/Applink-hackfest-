// Firebase ID-token verification only. No custom JWT. Role comes from Firebase custom claims.
import type { NextFunction, Request, Response } from 'express';
import { getFirebaseAuth } from '../config/firebase.ts';

export const ROLES = ['volunteer', 'coordinator', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export interface AuthContext { uid: string; email?: string; role: Role | null }
declare module 'express-serve-static-core' { interface Request { auth?: AuthContext } }

export const roleFromClaims = (claims: Record<string, unknown>): Role | null =>
  (ROLES as readonly string[]).includes(claims.role as string) ? (claims.role as Role) : null;

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const m = /^Bearer (.+)$/.exec(req.header('authorization') ?? '');
  if (!m) { res.status(401).json({ error: 'missing_bearer_token' }); return; }
  try {
    const t = await getFirebaseAuth().verifyIdToken(m[1]!);
    req.auth = { uid: t.uid, ...(t.email ? { email: t.email } : {}), role: roleFromClaims(t) };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
export const requireRole = (...allowed: Role[]) => (req: Request, res: Response, next: NextFunction): void => {
  if (!req.auth?.role || !allowed.includes(req.auth.role)) { res.status(403).json({ error: 'forbidden' }); return; }
  next();
};
