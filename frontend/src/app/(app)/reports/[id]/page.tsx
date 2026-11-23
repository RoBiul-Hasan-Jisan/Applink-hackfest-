'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EvidenceImg, PriorityBadge, Reasons, StatusBadge, Timeline } from '@/components/ReportBits';
import { useAction } from '@/hooks/useAction';
import { useLang } from '@/contexts/LangContext';
import { fmt } from '@/lib/utils';
import { getReport, listVolunteers } from '@/services/reports';
export default function Detail() {
  const { id } = useParams<{ id: string }>(), { t } = useLang(), m = useAction(), [msg, setMsg] = useState(''), [assignee, setAssignee] = useState('');
  const q = useQuery({ queryKey: ['report', id], queryFn: () => getReport(id) }), vols = useQuery({ queryKey: ['vols'], queryFn: listVolunteers });
  if (q.isLoading) return <p>{t('loading')}</p>; if (q.error || !q.data) return <p role="alert" className="text-crit">{(q.error as Error)?.message ?? 'Not found'}</p>;
  const r = q.data, run = (action: string, body: object = {}) => m.mutate({ id, action, body }, { onError: (e) => setMsg((e as Error).message) });
  const reopen = () => { const reason = window.prompt('Reason for reopening (required):'); if (reason) run('reopen', { reason }); };
  return (<div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold text-navy">{r.reportCode}</h1><StatusBadge s={r.status} /><PriorityBadge r={r} /></div>
    <Card className="grid gap-2 text-sm md:grid-cols-2"><div>Type: {t(r.type)}</div><div>Area: {r.area ?? r.areaId}</div><div>Landmark: {r.landmark ?? '-'}</div><div>Source: {r.source} · reporter {r.reporter}</div>
      <div>Risk estimate at submission: {r.riskLevelAtCreation ?? 'none'} <span className="text-slate-500">(context only; {t('estimate')})</span></div><div>Volunteer: {r.assignee ? `${r.assignee.name}${r.assignee.phoneVerified ? '' : ' (phone unverified)'}` : 'unassigned'}</div>
      <div>Resident confirmation: {r.residentConfirmed === null ? 'not yet' : r.residentConfirmed ? 'fixed' : 'still a problem'}</div><div>Created: {fmt(r.createdAt)}</div></Card>
    {r.evidence.length > 0 && <Card><div className="mb-2 text-xs font-semibold uppercase text-slate-500">Evidence</div><div className="flex flex-wrap gap-3">{r.evidence.map((e) => <div key={e.id}><EvidenceImg id={e.id} /><div className="mt-1 text-xs text-slate-500">{e.kind} · sha256 {e.sha256.slice(0, 10)}...</div></div>)}</div>{r.evidenceNote && <p className="mt-2 text-sm">Responder note: {r.evidenceNote}</p>}</Card>}
    <Card className="grid gap-3 md:grid-cols-2"><Reasons title="Priority explanation" items={r.priorityReasons} /><Reasons title="CARE notes" items={r.careNotes} /></Card>
    <Card className="space-y-2"><div className="text-xs font-semibold uppercase text-slate-500">Actions</div><div className="flex flex-wrap items-center gap-2">
      {r.status === 'CLEANED' && <Button variant="accent" onClick={() => run('verify')}>{t('verify')}</Button>}
      {['ASSIGNED', 'CLEANED', 'VERIFIED'].includes(r.status) && <Button variant="danger" onClick={reopen}>{t('reopen')}</Button>}
      {['APPROVED', 'REOPENED'].includes(r.status) && <><select className="rounded border border-line p-1.5 text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Assign volunteer...</option>{vols.data?.filter((v) => v.identityApproved && v.phoneVerified).map((v) => <option key={v.id} value={v.id}>{v.name} ({v.activeTasks} active)</option>)}</select><Button disabled={!assignee} onClick={() => run('assign', { assigneeId: assignee })}>Assign</Button></>}
      {r.status === 'NEW' && <p className="text-sm text-slate-600">Awaiting human review in the Evidence review queue.</p>}</div>{msg && <p role="alert" className="text-sm text-crit">{msg}</p>}</Card>
    <Card><div className="mb-2 text-xs font-semibold uppercase text-slate-500">Audit timeline</div><Timeline h={r.history} /></Card></div>);
}
