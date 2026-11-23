'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, Bell, ClipboardCheck, FileText, Languages, LayoutDashboard, LogOut, Map, Radio, Settings, ShieldCheck, TerminalSquare, Users, Wrench } from 'lucide-react';
import { useAuth, type Role } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { ROOT } from '@/lib/api';
import { cn } from '@/lib/utils';

const staff: Role[] = ['coordinator', 'admin'];
const NAV = [
  { href: '/overview', key: 'overview', icon: LayoutDashboard, roles: staff }, { href: '/review', key: 'review', icon: ClipboardCheck, roles: staff },
  { href: '/reports', key: 'reports', icon: FileText, roles: staff }, { href: '/map', key: 'map', icon: Map, roles: staff },
  { href: '/volunteers', key: 'volunteers', icon: Users, roles: staff }, { href: '/volunteer', key: 'myTasks', icon: Wrench, roles: ['volunteer'] as Role[] },
  { href: '/integrity', key: 'integrity', icon: ShieldCheck, roles: staff }, { href: '/telecom', key: 'telecom', icon: Radio, roles: staff },
  { href: '/analytics', key: 'analytics', icon: BarChart3, roles: staff }, { href: '/alerts', key: 'alerts', icon: Bell, roles: staff },
  { href: '/settings', key: 'settings', icon: Settings, roles: staff }, { href: '/sim', key: 'simulator', icon: TerminalSquare, roles: staff },
];
const MODE = { simulator: ['bg-amber-100 text-amber-900', 'DEVELOPMENT SIMULATOR: not live Applink. Nothing here proves a live integration.'], sandbox: ['bg-sky-100 text-sky-900', 'SANDBOX mode'], live: ['bg-emerald-100 text-emerald-900', 'LIVE Applink mode'] } as const;

export function Shell({ children }: { children: ReactNode }) {
  const { user, role, loading, signOut } = useAuth(), { t, toggle } = useLang(), path = usePathname(), router = useRouter();
  const health = useQuery({ queryKey: ['health'], queryFn: async () => (await fetch(`${ROOT}/health`)).json() as Promise<{ applinkMode: keyof typeof MODE }>, refetchInterval: 60_000 });
  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  if (loading || !user) return <div className="p-8 text-slate-500">{t('loading')}</div>;
  const items = NAV.filter((n) => role && n.roles.includes(role)), m = health.data ? MODE[health.data.applinkMode] : null;
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 bg-navy p-4 text-slate-200 md:block">
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-white"><Activity className="h-5 w-5 text-teal" />DengueZero</div>
        <nav className="space-y-1">{items.map((n) => (<Link key={n.href} href={n.href} className={cn('flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-navy-700', path.startsWith(n.href) && 'bg-navy-700 text-white')}><n.icon className="h-4 w-4" />{t(n.key)}</Link>))}</nav>
      </aside>
      <div className="flex-1">
        {m && <div className={cn('px-4 py-1 text-center text-xs font-medium', m[0])}>{m[1]}</div>}
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-2">
          <span className="text-sm text-slate-500">{user.email} · {role ?? 'no role yet'}</span>
          <div className="flex gap-2"><button onClick={toggle} className="flex items-center gap-1 text-sm text-navy"><Languages className="h-4 w-4" />{t('language')}</button><button onClick={() => signOut()} className="flex items-center gap-1 text-sm text-navy"><LogOut className="h-4 w-4" />{t('signOut')}</button></div>
        </header>
        <main className="mx-auto max-w-6xl space-y-4 p-4">{role ? children : <p className="text-sm text-slate-600">Your account has no role yet. Volunteers must be approved by an administrator.</p>}</main>
      </div>
    </div>
  );
}
