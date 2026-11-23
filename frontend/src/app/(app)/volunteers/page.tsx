'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { patch } from '@/lib/api';
import { listVolunteers } from '@/services/reports';
export default function Volunteers() {
  const { t } = useLang(), { role } = useAuth(), qc = useQueryClient(), q = useQuery({ queryKey: ['vols'], queryFn: listVolunteers });
  const approve = async (id: string, approved: boolean) => { await patch(`/admin/volunteers/${id}/approve`, { approved }).catch((e) => window.alert((e as Error).message)); qc.invalidateQueries(); };
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('volunteers')}</h1>
    {q.isLoading ? <p>{t('loading')}</p> : q.data?.length ? <Card className="divide-y divide-line p-0">{q.data.map((v) => (
      <div key={v.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><span className="font-medium text-navy">{v.name}</span><Badge kind={v.phoneVerified ? 'VERIFIED' : 'MEDIUM'}>{v.phoneVerified ? 'phone verified' : 'phone unverified'}</Badge><Badge kind={v.identityApproved ? 'VERIFIED' : 'MEDIUM'}>{v.identityApproved ? 'approved' : 'pending approval'}</Badge>
        <Badge>{v.isAvailable ? 'available' : 'unavailable'}</Badge><span className="text-slate-500">{v.activeTasks} active · {v.completedTasks} completed</span>
        {role === 'admin' && <Button className="ml-auto" variant={v.identityApproved ? 'danger' : 'accent'} onClick={() => approve(v.id, !v.identityApproved)}>{v.identityApproved ? 'Revoke' : 'Approve'}</Button>}</div>))}</Card> : <p className="text-slate-600">{t('empty')}</p>}</div>);
}
