'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EvidenceImg, StatusBadge } from '@/components/ReportBits';
import { useAction } from '@/hooks/useAction';
import { useLang } from '@/contexts/LangContext';
import { api, fileToBase64, patch, post } from '@/lib/api';
import type { Report } from '@/types';
interface Me { profile: { id: string; isAvailable: boolean; phoneVerified: boolean; identityApproved: boolean } | null }
function Task({ r }: { r: Report }) {
  const { t } = useLang(), m = useAction(), qc = useQueryClient(), [notes, setNotes] = useState(''), [photo, setPhoto] = useState<File | null>(null), [msg, setMsg] = useState('');
  const run = (action: string, body: object = {}) => m.mutate({ id: r.id, action, body }, { onError: (e) => setMsg((e as Error).message) });
  const clean = async () => { try { if (photo) await post(`/reports/${r.id}/evidence`, { photoBase64: await fileToBase64(photo) }); run('clean', { notes }); } catch (e) { setMsg((e as Error).message); } void qc; };
  const decline = () => { const reason = window.prompt('Why are you declining? (required)'); if (reason) run('decline', { reason }); };
  return (<Card className="space-y-2"><div className="flex items-center gap-2"><span className="font-semibold text-navy">{r.reportCode}</span><StatusBadge s={r.status} /><span className="text-sm text-slate-600">{t(r.type)}{r.landmark ? ` near ${r.landmark}` : ''}</span></div>
    {r.evidence.filter((e) => e.kind === 'report').map((e) => <EvidenceImg key={e.id} id={e.id} />)}
    {r.status === 'ASSIGNED' && <div className="flex gap-2"><Button variant="accent" onClick={() => run('accept')}>{t('accept')}</Button><Button variant="ghost" onClick={decline}>{t('decline')}</Button></div>}
    {r.status === 'ACCEPTED' && <div className="space-y-2"><textarea className="w-full rounded border border-line p-2 text-sm" rows={2} placeholder="What you actually did (honest notes)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <input type="file" accept="image/jpeg,image/png" className="block text-sm" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /><p className="text-xs text-slate-500">Attach a real photo of the completed action where possible.</p><Button variant="accent" onClick={clean}>{t('markCleaned')}</Button></div>}
    {msg && <p role="alert" className="text-sm text-crit">{msg}</p>}</Card>);
}
export default function MyTasks() {
  const { t } = useLang(), qc = useQueryClient(), me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const p = me.data?.profile, tasks = useQuery({ queryKey: ['mytasks', p?.id], enabled: !!p, queryFn: () => api<{ active: Report[]; history: Report[] }>(`/volunteers/${p!.id}/tasks`) });
  const toggle = async () => { await patch(`/volunteers/${p!.id}/availability`, { isAvailable: !p!.isAvailable }).catch((e) => window.alert((e as Error).message)); qc.invalidateQueries(); };
  if (me.isLoading) return <p>{t('loading')}</p>; if (!p) return <p>No volunteer profile yet. Ask an administrator to register you.</p>;
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('myTasks')}</h1>
    <Card className="flex items-center justify-between text-sm"><span>Phone verified: {p.phoneVerified ? 'yes' : 'no'} · Approved by admin: {p.identityApproved ? 'yes' : 'no'}</span><Button variant={p.isAvailable ? 'accent' : 'ghost'} onClick={toggle}>{p.isAvailable ? 'Available' : 'Unavailable'}</Button></Card>
    {tasks.data?.active.length ? tasks.data.active.map((r) => <Task key={r.id} r={r} />) : <p className="text-slate-600">{t('empty')}</p>}
    {!!tasks.data?.history.length && <Card><div className="mb-1 text-xs font-semibold uppercase text-slate-500">History</div><ul className="text-sm">{tasks.data.history.map((r) => <li key={r.id}>{r.reportCode} · {t(r.status)}</li>)}</ul></Card>}</div>);
}
