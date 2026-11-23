'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PriorityBadge, StatusBadge } from '@/components/ReportBits';
import { Card } from '@/components/ui/card';
import { useLang } from '@/contexts/LangContext';
import { fmt } from '@/lib/utils';
import { listAreas, listReports } from '@/services/reports';
export default function Reports() {
  const { t } = useLang(), [q, setQ] = useState(''), [status, setStatus] = useState(''), [priority, setPriority] = useState(''), [areaId, setArea] = useState(''), [sort, setSort] = useState('newest');
  const qs = '?' + new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(priority && { priority }), ...(areaId && { areaId }), sort }).toString();
  const reports = useQuery({ queryKey: ['reports', qs], queryFn: () => listReports(qs) }), areas = useQuery({ queryKey: ['areas'], queryFn: listAreas });
  const sel = 'rounded border border-line bg-white p-1.5 text-sm';
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('reports')}</h1>
    <div className="flex flex-wrap gap-2"><input className={sel} placeholder="Search code or landmark" value={q} onChange={(e) => setQ(e.target.value)} />
      <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['NEW', 'APPROVED', 'ASSIGNED', 'ACCEPTED', 'CLEANED', 'VERIFIED', 'REJECTED', 'REOPENED'].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
      <select className={sel} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All priorities</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s}>{s}</option>)}</select>
      <select className={sel} value={areaId} onChange={(e) => setArea(e.target.value)}><option value="">All areas</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <select className={sel} value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="priority">Priority</option></select></div>
    {reports.isLoading ? <p>{t('loading')}</p> : reports.data?.length ? (
      <Card className="divide-y divide-line p-0">{reports.data.map((r) => (<Link key={r.id} href={`/reports/${r.id}`} className="flex flex-wrap items-center gap-2 p-3 hover:bg-mist"><span className="font-medium text-navy">{r.reportCode}</span><StatusBadge s={r.status} /><PriorityBadge r={r} /><span className="text-sm text-slate-500">{t(r.type)} · {fmt(r.createdAt)}</span></Link>))}</Card>) : <p className="text-slate-600">{t('empty')}</p>}</div>);
}
