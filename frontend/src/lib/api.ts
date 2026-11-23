import { auth } from './firebase';
export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
export const ROOT = API.replace(/\/api\/?$/, '');
export class ApiError extends Error { status: number; code: string; constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; } }

async function call<T>(url: string, init: RequestInit = {}, authed = true): Promise<T> {
  const headers = new Headers(init.headers); if (init.body) headers.set('Content-Type', 'application/json');
  if (authed) { const t = await auth.currentUser?.getIdToken(); if (t) headers.set('Authorization', `Bearer ${t}`); } // Firebase ID token only
  const r = await fetch(url, { ...init, headers });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? 'error', body.message ?? body.error ?? r.statusText);
  return body as T;
}
export const api = <T,>(path: string, init?: RequestInit) => call<T>(`${API}${path}`, init);
export const publicApi = <T,>(path: string, init?: RequestInit) => call<T>(`${ROOT}${path}`, init, false);
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export async function evidenceUrl(id: string): Promise<string> { // evidence is private: fetch with the token, show via blob URL
  const t = await auth.currentUser?.getIdToken(); const r = await fetch(`${API}/evidence/${id}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new ApiError(r.status, 'evidence', 'cannot load evidence'); return URL.createObjectURL(await r.blob());
}
export const fileToBase64 = (f: File) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(f); });
