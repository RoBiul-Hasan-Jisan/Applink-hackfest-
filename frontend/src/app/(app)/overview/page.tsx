'use client';
import { useQuery } from '@tanstack/react-query';
import { Stat } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useLang } from '@/contexts/LangContext';
interface S { totalReports: number; unresolved: number; verifiedHotspots: number; highPriority: number; activeVolunteers: number; resolved: number; avgResponseHours: number | null; resolutionRate: number | null; linkedDuplicates: number }
export default function Overview() {
  const { t } = useLang(), q = useQuery({ queryKey: ['summary'], queryFn: () => api<S>('/analytics/summary') });
  if (q.isLoading) return <p>{t('loading')}</p>; if (q.error) return <p role="alert" className="text-crit">{(q.error as Error).message}</p>;
  const s = q.data!; if (s.totalReports === 0) return <p className="text-slate-600">{t('empty')}</p>;
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('overview')}</h1>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Total reports" value={s.totalReports} hint={`${s.linkedDuplicates} possible duplicates`} /><Stat label="Unresolved" value={s.unresolved} /><Stat label="High priority open" value={s.highPriority} /><Stat label="Resolved (verified)" value={s.resolved} />
      <Stat label="Active volunteers" value={s.activeVolunteers} /><Stat label="Avg response (h)" value={s.avgResponseHours} hint="report to accepted" /><Stat label="Resolution rate %" value={s.resolutionRate} /><Stat label="Verified" value={s.verifiedHotspots} />
    </div><p className="text-xs text-slate-500">Figures count genuine reports only; synthetic or simulator records are excluded.</p></div>);
}
