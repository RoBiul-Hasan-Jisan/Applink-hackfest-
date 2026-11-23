'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROOT, publicApi } from '@/lib/api';
import { fmt } from '@/lib/utils';
// DEVELOPMENT ONLY. Talks to the backend's /sim routes, which exist only when APPLINK_MODE=simulator and NODE_ENV!=production.
export default function Sim() {
  const [phone, setPhone] = useState('01700000001'), [sid, setSid] = useState(() => `sim-${Date.now()}`), [input, setInput] = useState(''), [screen, setScreen] = useState<string | null>(null), [live, setLive] = useState(false), [smsText, setSmsText] = useState('');
  const mode = useQuery({ queryKey: ['simmode'], queryFn: () => publicApi<{ mode: string }>('/sim/mode'), retry: false });
  const out = useQuery({ queryKey: ['outbox', phone], queryFn: () => publicApi<{ id: string; to: string; body: string; at: string }[]>(`/sim/outbox?phone=${encodeURIComponent(phone)}`), refetchInterval: 3000, enabled: !!mode.data });
  if (mode.error) return <p className="text-slate-600">Simulator routes are not available: the backend is not in simulator mode (this is correct for sandbox/live/production).</p>;
  const send = async (text: string) => { const r = await publicApi<{ text: string; continueSession: boolean }>('/sim/ussd', { method: 'POST', body: JSON.stringify({ sessionId: sid, msisdn: phone, text }) }); setScreen(r.text); setLive(r.continueSession); setInput(''); };
  const sms = async () => { await publicApi('/sim/sms', { method: 'POST', body: JSON.stringify({ from: phone, text: smsText }) }); setSmsText(''); out.refetch(); };
  return (<div className="space-y-3"><div className="rounded bg-amber-100 p-2 text-sm font-medium text-amber-900">DEVELOPMENT SIMULATOR ({ROOT}). These are not Applink calls.</div>
    <Card className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><label className="block text-sm">Simulated phone<input className="mt-1 w-full rounded border border-line p-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <div className="rounded bg-slate-900 p-3 font-mono text-xs leading-5 text-green-300"><pre className="whitespace-pre-wrap">{screen ?? 'Press "Dial" to start a USSD session'}</pre></div>
      <div className="flex gap-2"><input className="flex-1 rounded border border-line p-1.5 text-sm" value={input} disabled={!live} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && input && send(input)} /><Button onClick={() => (live ? send(input) : (setSid(`sim-${Date.now()}`), send('')))}>{live ? 'Send' : 'Dial'}</Button></div></div>
      <div className="space-y-2"><div className="flex gap-2"><input className="flex-1 rounded border border-line p-1.5 text-sm" placeholder="SMS e.g. REPORT WATER <area> / ACCEPT DAI-2026-0001 / STATUS ..." value={smsText} onChange={(e) => setSmsText(e.target.value)} /><Button variant="accent" disabled={!smsText} onClick={sms}>Send SMS</Button></div>
        <div className="text-xs font-semibold uppercase text-slate-500">Simulated outbox for this phone</div><ul className="space-y-1 text-xs">{out.data?.map((m) => <li key={m.id} className="rounded bg-mist p-2">{fmt(m.at)}: {m.body}</li>)}</ul></div></Card></div>);
}
