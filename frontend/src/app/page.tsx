'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLang } from '@/contexts/LangContext';
import { fileToBase64, publicApi } from '@/lib/api';

const schema = z.object({ phone: z.string().min(10, 'Enter your mobile number'), type: z.enum(['standing_water', 'hotspot', 'drainage', 'other']), areaId: z.string().min(1, 'Choose an area'), landmark: z.string().max(60).optional(),
  consentToUpdates: z.boolean(), consentToStoreEvidence: z.boolean() });
type V = z.infer<typeof schema>;

export default function Home() {
  const { t, toggle } = useLang(), [photo, setPhoto] = useState<File | null>(null), [done, setDone] = useState<{ reportCode: string } | null>(null), [err, setErr] = useState('');
  const areas = useQuery({ queryKey: ['pub-areas'], queryFn: () => publicApi<{ id: string; name: string }[]>('/public/areas') });
  const f = useForm<V>({ resolver: zodResolver(schema), defaultValues: { type: 'standing_water', consentToUpdates: false, consentToStoreEvidence: false } });
  const submit = f.handleSubmit(async (v) => {
    setErr('');
    if (photo && !v.consentToStoreEvidence) { setErr('Please tick the consent box to attach a photo.'); return; }
    try { setDone(await publicApi('/public/reports', { method: 'POST', body: JSON.stringify({ ...v, ...(photo ? { photoBase64: await fileToBase64(photo) } : {}) }) })); }
    catch (e) { setErr((e as Error).message); }
  });
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center justify-between"><h1 className="text-xl font-semibold text-navy">DengueZero: {t('reportHazard')}</h1><button onClick={toggle} className="text-sm text-navy">{t('language')}</button></header>
      <p className="text-sm text-slate-600">Report a real standing-water or mosquito hazard you have seen. A person reviews every report before any action. This is environmental prevention support, not medical advice. {t('estimate')}</p>
      {done ? <Card><div className="text-lg font-semibold text-navy">Report code: {done.reportCode}</div><p className="mt-1 text-sm">{t('awaiting')} Keep the code to track it by SMS.</p></Card> : (
        <Card><form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">Mobile number<input className="mt-1 w-full rounded border border-line p-2" inputMode="tel" {...f.register('phone')} /></label>
          <label className="block text-sm">What did you see?<select className="mt-1 w-full rounded border border-line p-2" {...f.register('type')}>{['standing_water', 'hotspot', 'drainage', 'other'].map((k) => <option key={k} value={k}>{t(k)}</option>)}</select></label>
          <label className="block text-sm">Area<select className="mt-1 w-full rounded border border-line p-2" {...f.register('areaId')}><option value="">{areas.isLoading ? t('loading') : 'Select...'}</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="block text-sm">Landmark (optional)<input className="mt-1 w-full rounded border border-line p-2" maxLength={60} {...f.register('landmark')} /></label>
          <label className="block text-sm">Photo (optional, JPEG/PNG up to 5 MB; location data is removed)<input type="file" accept="image/jpeg,image/png" className="mt-1 block w-full text-sm" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" {...f.register('consentToStoreEvidence')} />I consent to storing my photo for review by authorized staff.</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" {...f.register('consentToUpdates')} />I agree to receive SMS updates about this report (reply STOP to end).</label>
          {(err || Object.values(f.formState.errors)[0]?.message) && <p role="alert" className="text-sm text-crit">{err || String(Object.values(f.formState.errors)[0]?.message)}</p>}
          <Button type="submit" variant="accent" disabled={f.formState.isSubmitting}>{t('submit')}</Button>
        </form></Card>)}
      <p className="text-center text-xs text-slate-500">Staff and volunteers: <Link className="underline" href="/login">sign in</Link></p>
    </div>
  );
}
