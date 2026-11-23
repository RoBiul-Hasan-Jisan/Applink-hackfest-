'use client';
import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { evidenceUrl } from '@/lib/api';
import { fmt } from '@/lib/utils';
import { useLang } from '@/contexts/LangContext';
import type { HistoryEntry, Report } from '@/types';

export const StatusBadge = ({ s }: { s: string }) => { const { t } = useLang(); return <Badge kind={s}>{t(s)}</Badge>; };
export const PriorityBadge = ({ r }: { r: Pick<Report, 'priorityCategory' | 'priorityScore' | 'priorityOverride'> }) => <Badge kind={r.priorityCategory}>{r.priorityCategory} {r.priorityScore}{r.priorityOverride ? ' (overridden)' : ''}</Badge>;
export const Timeline = ({ h }: { h: HistoryEntry[] }) => (
  <ol className="space-y-2 border-l-2 border-line pl-4">{h.map((e, i) => (
    <li key={i} className="text-sm"><span className="font-medium text-navy">{e.from === e.to ? 'Created' : `${e.from} → ${e.to}`}</span> <span className="text-slate-500">by {e.actorRole} ({e.actorId.slice(0, 8)}) · {fmt(e.at)}</span>
      {(e.reason || e.notes) && <div className="text-slate-600">{e.reason ?? e.notes}</div>}</li>))}</ol>);
export function EvidenceImg({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null), [err, setErr] = useState(false);
  useEffect(() => { let u: string | undefined; evidenceUrl(id).then((x) => { u = x; setSrc(x); }).catch(() => setErr(true)); return () => { if (u) URL.revokeObjectURL(u); }; }, [id]);
  if (err) return <div className="text-xs text-slate-500">Evidence unavailable</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="Submitted evidence" className="h-32 rounded border border-line object-cover" /> : <div className="h-32 w-40 animate-pulse rounded bg-slate-100" />;
}
export const Reasons = ({ title, items }: { title: string; items: string[] }) => (
  <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>);
