'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
export default function Login() {
  const { signIn, signInGoogle } = useAuth(), { t } = useLang(), router = useRouter(), [err, setErr] = useState('');
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const go = async (p: Promise<unknown>) => { try { await p; router.replace('/overview'); } catch { setErr('Sign-in failed. Check your details.'); } };
  return (
    <div className="mx-auto mt-24 max-w-sm"><Card className="space-y-3">
      <h1 className="text-xl font-semibold text-navy">DengueZero {t('signIn')}</h1>
      <form className="space-y-3" onSubmit={f.handleSubmit((v) => go(signIn(v.email, v.password)))}>
        <input className="w-full rounded border border-line p-2 text-sm" placeholder="Email" autoComplete="username" {...f.register('email')} />
        <input className="w-full rounded border border-line p-2 text-sm" type="password" placeholder="Password" autoComplete="current-password" {...f.register('password')} />
        {(err || Object.values(f.formState.errors)[0]) && <p className="text-sm text-crit" role="alert">{err || 'Enter a valid email and password (6+ characters).'}</p>}
        <Button type="submit" className="w-full">{t('signIn')}</Button>
      </form>
      <Button variant="ghost" className="w-full" onClick={() => go(signInGoogle())}>Google</Button>
      <p className="text-xs text-slate-500">Residents do not need an account: report by SMS/USSD (when enabled) or the public form.</p>
    </Card></div>
  );
}
