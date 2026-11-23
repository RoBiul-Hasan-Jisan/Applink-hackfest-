'use client';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useLang } from '@/contexts/LangContext';
import { listAreas, listReports } from '@/services/reports';
const AreaMap = dynamic(() => import('./AreaMap'), { ssr: false, loading: () => <p>Loading map...</p> });
export default function MapPage() {
  const { t } = useLang(), areas = useQuery({ queryKey: ['areas'], queryFn: listAreas }), reports = useQuery({ queryKey: ['reports', 'all'], queryFn: () => listReports('?sort=newest') });
  const pins = (areas.data ?? []).filter((a) => a.centroid).map((a) => ({ ...a, open: (reports.data ?? []).filter((r) => r.areaId === a.id && ['APPROVED', 'ASSIGNED', 'ACCEPTED', 'REOPENED'].includes(r.status)).length }));
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('map')}</h1>
    <p className="text-sm text-slate-600">Area-level counts of <b>reviewed, open</b> reports only. No resident locations are shown, and counts are never presented as street-level hotspots.</p>
    {pins.length ? <AreaMap pins={pins} /> : <p className="text-slate-600">{t('empty')} (areas need centroids; see data/areas.template.json)</p>}</div>);
}
