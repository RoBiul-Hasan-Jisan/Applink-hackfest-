'use client';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Stat } from '@/components/ui/card';
import { useLang } from '@/contexts/LangContext';
import { api } from '@/lib/api';
interface R { daily: { date: string; count: number }[]; byArea: { area: string; open: number; resolved: number }[]; priority: Record<string, number>; volunteers: { name: string; completed: number; activeTasks: number }[] }
interface P { slaHours: number; avgHoursToAssign: number | null; avgHoursToAccept: number | null; avgHoursToClean: number | null; avgHoursToVerify: number | null; slaCompliancePct: number | null; reopenedCases: number; reopenRatePct: number | null }
export default function Analytics() {
  const { t } = useLang(), r = useQuery({ queryKey: ['an-r'], queryFn: () => api<R>('/analytics/reports?days=30') }), p = useQuery({ queryKey: ['an-p'], queryFn: () => api<P>('/analytics/response-performance') });
  if (!r.data || !p.data) return <p>{t('loading')}</p>; const d = r.data, perf = p.data;
  if (!d.daily.some((x) => x.count)) return <p className="text-slate-600">{t('empty')}</p>;
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('analytics')}</h1>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Avg h to accept" value={perf.avgHoursToAccept} /><Stat label="Avg h to verify" value={perf.avgHoursToVerify} /><Stat label={`SLA ≤ ${perf.slaHours}h %`} value={perf.slaCompliancePct} /><Stat label="Reopened cases" value={perf.reopenedCases} hint={perf.reopenRatePct === null ? undefined : `${perf.reopenRatePct}%`} /></div>
    <Card><div className="mb-1 text-sm font-semibold text-navy">Reports per day (30 days)</div><ResponsiveContainer width="100%" height={220}><LineChart data={d.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Line dataKey="count" stroke="#0E7C86" /></LineChart></ResponsiveContainer></Card>
    <Card><div className="mb-1 text-sm font-semibold text-navy">Open vs resolved by area</div><ResponsiveContainer width="100%" height={220}><BarChart data={d.byArea}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="area" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="open" fill="#C53030" /><Bar dataKey="resolved" fill="#2E9E6B" /></BarChart></ResponsiveContainer></Card>
    <Card className="text-sm">Priority distribution: {Object.entries(d.priority).map(([k, v]) => `${k} ${v}`).join(' · ')}</Card></div>);
}
