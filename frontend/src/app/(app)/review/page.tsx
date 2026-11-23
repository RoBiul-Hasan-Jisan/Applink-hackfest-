'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EvidenceImg, PriorityBadge, Reasons } from '@/components/ReportBits';
import { useAction } from '@/hooks/useAction';
import { useLang } from '@/contexts/LangContext';
import { patch } from '@/lib/api';
import { reviewQueue } from '@/services/reports';
import type { Report } from '@/types';
import { Badge } from '@/components/ui/badge';

function Item({ r }: { r: Report }) {
  const { t } = useLang(), m = useAction(), [notDup, setNotDup] = useState(false), [msg, setMsg] = useState('');
  const run = (action: string, body: object = {}) => m.mutate({ id: r.id, action, body }, { onError: (e) => setMsg((e as Error).message) });
  const reject = () => { const reason = window.prompt('Reason for rejecting (required):'); if (reason) run('reject', { reason }); };
  const override = async () => {
    const category = window.prompt('New priority: LOW, MEDIUM, HIGH or CRITICAL'); const reason = category && window.prompt('Reason (required):');
    if (category && reason) try { await patch(`/reports/${r.id}/priority`, { category: category.toUpperCase(), reason }); window.location.reload(); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-navy">{r.reportCode}</span><PriorityBadge r={r} /><Badge>{t(r.type)}</Badge><Badge>{r.source}</Badge><Badge kind={r.evidenceCompleteness === 'COMPLETE' ? 'VERIFIED' : r.evidenceCompleteness === 'MINIMAL' ? 'CRITICAL' : 'MEDIUM'}>Evidence: {r.evidenceCompleteness}</Badge>{r.landmark && <span className="text-sm text-slate-600">near {r.landmark}</span>}</div>
      {r.evidence.length > 0 && <div className="flex gap-2">{r.evidence.map((e) => <EvidenceImg key={e.id} id={e.id} />)}</div>}
      <div className="grid gap-3 md:grid-cols-2"><Reasons title="Why this priority" items={r.priorityReasons} /><Reasons title="CARE notes for the reviewer" items={r.careNotes} /></div>
      {r.duplicateOf && <label className="flex gap-2 rounded bg-amber-50 p-2 text-sm"><input type="checkbox" checked={notDup} onChange={(e) => setNotDup(e.target.checked)} />Possible duplicate. Tick only if you have checked that this is a different hazard (otherwise reject as merged).</label>}
      <div className="flex flex-wrap gap-2"><Button variant="accent" disabled={m.isPending || (!!r.duplicateOf && !notDup)} onClick={() => run('approve', { notDuplicate: notDup })}>{t('approve')}</Button><Button variant="danger" onClick={reject}>{t('reject')}</Button><Button variant="ghost" onClick={override}>Override priority</Button></div>
      {msg && <p role="alert" className="text-sm text-crit">{msg}</p>}
    </Card>);
}
export default function Review() {
  const { t } = useLang(), q = useQuery({ queryKey: ['review-queue'], queryFn: reviewQueue });
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('review')}</h1>
    <p className="text-sm text-slate-600">Nothing is dispatched until a person approves it here. A report is an observation, not a confirmed breeding site.</p>
    {q.isLoading ? <p>{t('loading')}</p> : q.data?.length ? q.data.map((r) => <Item key={r.id} r={r} />) : <p className="text-slate-600">{t('empty')}</p>}</div>);
}
