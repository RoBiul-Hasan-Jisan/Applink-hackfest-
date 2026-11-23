'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, Stat } from '@/components/ui/card';
import { useLang } from '@/contexts/LangContext';
import { api } from '@/lib/api';
import { fmt } from '@/lib/utils';
interface T { mode: string; stats: { total: number; accepted: number; delivered: number; deliveryUnconfirmed: number; failed: number }; recent: { id: string; to: string; template: string; status: string; deliveryStatus: string | null; providerMessageId: string | null; createdAt: string }[] }
export default function Telecom() {
  const { t } = useLang(), q = useQuery({ queryKey: ['telecom'], queryFn: () => api<T>('/telecom'), refetchInterval: 15_000 });
  if (!q.data) return <p>{q.isLoading ? t('loading') : (q.error as Error).message}</p>; const { stats: s } = q.data;
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('telecom')}</h1>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Messages" value={s.total} /><Stat label="Accepted by provider" value={s.accepted} /><Stat label="Delivery confirmed" value={s.delivered} /><Stat label="Failed" value={s.failed} /></div>
    <Card className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Time</th><th>To (pseudonym)</th><th>Template</th><th>Provider result</th><th>Delivery</th><th>Provider id</th></tr></thead><tbody>
      {q.data.recent.map((m) => <tr key={m.id}><td>{fmt(m.createdAt)}</td><td>{m.to}</td><td>{m.template}</td><td>{m.status}</td><td>{m.deliveryStatus ?? 'unconfirmed'}</td><td className="font-mono">{m.providerMessageId?.slice(0, 14) ?? '-'}</td></tr>)}</tbody></table>{!q.data.recent.length && <p className="text-sm text-slate-600">{t('empty')}</p>}</Card></div>);
}
