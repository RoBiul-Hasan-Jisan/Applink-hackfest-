'use client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { useLang } from '@/contexts/LangContext';
import { api } from '@/lib/api';
interface U { mode: string; rates: { smsBdt: number; ussdMenuBdt: number }; ratesNote: string; reportFlow: { usage: { ussdMenus: number; sms: number }; estimatedBdt: number }; fullLifecycle: { usage: { ussdMenus: number; sms: number }; estimatedBdt: number }; smsLanguage: string }
export default function Settings() {
  const { t } = useLang(), q = useQuery({ queryKey: ['usage'], queryFn: () => api<U>('/settings/usage') });
  if (!q.data) return <p>{t('loading')}</p>; const u = q.data;
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('settings')}</h1>
    <Card className="space-y-1 text-sm"><div className="font-semibold text-navy">Telecom cost estimator</div><div>Assumed rates: SMS BDT {u.rates.smsBdt}, USSD menu BDT {u.rates.ussdMenuBdt}. <span className="text-slate-500">{u.ratesNote}</span></div>
      <div>One USSD report ({u.reportFlow.usage.ussdMenus} screens + {u.reportFlow.usage.sms} SMS): about BDT {u.reportFlow.estimatedBdt}</div><div>Lifecycle messaging ({u.fullLifecycle.usage.sms} SMS) plus the report: about BDT {u.fullLifecycle.estimatedBdt}</div><div>Integration mode: {u.mode} · SMS language: {u.smsLanguage}</div></Card></div>);
}
