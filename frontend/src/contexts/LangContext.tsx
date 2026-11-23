'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dict, type Lang } from '@/lib/i18n';
const Ctx = createContext<{ lang: Lang; toggle: () => void; t: (k: string) => string }>({ lang: 'en', toggle: () => {}, t: (k) => k });
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => { const s = localStorage.getItem('lang'); if (s === 'bn' || s === 'en') setLang(s); }, []);
  const toggle = () => setLang((l) => { const n = l === 'en' ? 'bn' : 'en'; localStorage.setItem('lang', n); return n; });
  const t = (k: string) => (dict[lang] as Record<string, string>)[k] ?? k;
  return <Ctx.Provider value={{ lang, toggle, t }}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
