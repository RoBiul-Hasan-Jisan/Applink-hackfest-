'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, Stat } from '@/components/ui/card';
import { useLang } from '@/contexts/LangContext';
import { api } from '@/lib/api';
import { fmt } from '@/lib/utils';
interface I { generatedAt: string; policy: string; reports: { total: number; excludedSynthetic: number; bySource: Record<string, number>; byStatus: Record<string, number>; byEvidenceCompleteness: Record<string, number> };
  evidence: { id: string; reportCode: string; kind: string; mime: string; bytes: number; sha256: string; uploadedAt: string }[]; priority: { ruleVersions: string[]; overrides: number };
  risk: { area: string; date: string; modelVersion: string; evaluationStatus: string; dataCoverage: string; usedForPriority: boolean }[]; riskNote: string;
  telecom: { total: number; accepted: number; delivered: number; deliveryUnconfirmed: number; failed: number; note: string }; mode: string }
export default function Integrity() {
  const { t } = useLang(), q = useQuery({ queryKey: ['integrity'], queryFn: () => api<I>('/integrity') });
  if (q.isLoading) return <p>{t('loading')}</p>; if (!q.data) return <p role="alert" className="text-crit">{(q.error as Error)?.message}</p>;
  const d = q.data, row = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'none';
  return (<div className="space-y-3"><h1 className="text-xl font-semibold text-navy">{t('integrity')}</h1><p className="text-sm text-slate-600">{d.policy}</p>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Genuine reports" value={d.reports.total} hint={`${d.reports.excludedSynthetic} synthetic excluded`} /><Stat label="Evidence files" value={d.evidence.length} /><Stat label="Priority rules" value={d.priority.ruleVersions.join(', ') || 'n/a'} hint={`${d.priority.overrides} reviewer overrides`} /><Stat label="Integration mode" value={d.mode} /></div>
    <Card className="space-y-1 text-sm"><div>By source: {row(d.reports.bySource)}</div><div>By status: {row(d.reports.byStatus)}</div><div>Evidence completeness: {row(d.reports.byEvidenceCompleteness)}</div></Card>
    <Card className="space-y-1 text-sm"><div className="font-semibold text-navy">Telecom: accepted is not delivered</div><div>Accepted by provider: {d.telecom.accepted} · Delivery confirmed: {d.telecom.delivered} · Unconfirmed: {d.telecom.deliveryUnconfirmed} · Failed: {d.telecom.failed}</div><div className="text-xs text-slate-500">{d.telecom.note}</div></Card>
    <Card className="text-sm"><div className="font-semibold text-navy">Risk estimates</div><p className="text-xs text-slate-500">{d.riskNote}</p>{d.risk.length ? d.risk.map((r) => <div key={r.area}>{r.area}: {r.modelVersion} · {r.evaluationStatus} · {r.usedForPriority ? 'used in priority' : 'context only'}<div className="text-xs text-slate-500">{r.dataCoverage}</div></div>) : 'No risk estimates imported.'}</Card>
    <Card className="overflow-x-auto"><div className="mb-1 text-sm font-semibold text-navy">Evidence ledger (checksums)</div><table className="w-full text-left text-xs"><thead><tr><th>Report</th><th>Kind</th><th>Type</th><th>Bytes</th><th>SHA-256</th><th>Uploaded</th></tr></thead><tbody>{d.evidence.map((e) => <tr key={e.id}><td>{e.reportCode}</td><td>{e.kind}</td><td>{e.mime}</td><td>{e.bytes}</td><td className="font-mono">{e.sha256.slice(0, 16)}...</td><td>{fmt(e.uploadedAt)}</td></tr>)}</tbody></table>{!d.evidence.length && <p className="text-sm text-slate-600">{t('empty')}</p>}</Card></div>);
}
