import { cn } from '@/lib/utils';
const tone: Record<string, string> = { LOW: 'bg-emerald-50 text-emerald-800', MEDIUM: 'bg-amber-50 text-amber-800', HIGH: 'bg-orange-100 text-orange-800', CRITICAL: 'bg-red-100 text-red-800',
  VERIFIED: 'bg-emerald-50 text-emerald-800', REJECTED: 'bg-slate-200 text-slate-700', REOPENED: 'bg-red-100 text-red-800', NEW: 'bg-sky-50 text-sky-800', default: 'bg-slate-100 text-slate-700' };
export const Badge = ({ children, kind }: { children: React.ReactNode; kind?: string }) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone[kind ?? 'default'] ?? tone.default)}>{children}</span>;
