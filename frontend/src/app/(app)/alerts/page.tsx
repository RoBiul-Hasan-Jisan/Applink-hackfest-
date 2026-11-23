'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLang } from '@/contexts/LangContext';
import { api, post } from '@/lib/api';
import { fmt } from '@/lib/utils';
import { listAreas } from '@/services/reports';
interface C { id: string; areaId: string; message: string; recipients: number; skipped: number; createdAt: string }
export default function Alerts() {
  const { t } = useLang(), qc = useQueryClient(), [areaId, setArea] = useState(''), [msg, setMsg] = useState(''), areas = useQuery({ queryKey: ['areas'], queryFn: listAreas }), camps = useQuery({ queryKey: ['camps'], queryFn: () => api<C[]>('/campaigns') });
  const send = async () => { if (!window.confirm('Send this prevention alert to opted-in residents of this area? Each costs an SMS and nobody is messaged twice in 24h.')) return;
    try { const c = await post<C>('/campaigns/alert', { areaId }); setMsg(`Sent to ${c.recipients}, skipped ${c.skipped}.`); qc.invalidateQueries({ queryKey: ['camps'] }); } catch (e) { setMsg((e as Error).message); } };
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('alerts')}</h1>
    <Card className="space-y-2 text-sm"><p>Alerts go only to residents who opted in by consenting to updates on a past report, are never repeated within 24 hours, and always say the risk is an estimate. Residents can reply STOP.</p>
      <div className="flex gap-2"><select className="rounded border border-line p-1.5" value={areaId} onChange={(e) => setArea(e.target.value)}><option value="">Select area...</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><Button disabled={!areaId} onClick={send}>Send alert</Button></div>{msg && <p>{msg}</p>}</Card>
    <Card className="divide-y divide-line p-0">{camps.data?.length ? camps.data.map((c) => <div key={c.id} className="p-3 text-sm">{fmt(c.createdAt)} · sent {c.recipients}, skipped {c.skipped}<div className="text-xs text-slate-500">{c.message}</div></div>) : <p className="p-3 text-slate-600">{t('empty')}</p>}</Card></div>);
}
