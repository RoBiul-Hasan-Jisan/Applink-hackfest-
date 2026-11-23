import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-lg border border-line bg-white p-4 shadow-sm', className)} {...p} />;
export const Stat = ({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) => (
  <Card><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold text-navy">{value ?? 'n/a'}</div>{hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}</Card>);
