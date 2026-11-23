import type { Ctx } from '../controllers/support.ts';

export function startJobs(ctx: Ctx, pollSeconds: number): () => void {
  let polling = false, reminding = false;
  const poll = setInterval(async () => {
    if (polling) return; polling = true; // never overlap runs
    try { await ctx.engine.pollInboundSms(); } catch (e) { console.error('sms poll failed', (e as Error).message); } finally { polling = false; }
  }, pollSeconds * 1000);
  const remind = setInterval(async () => {
    if (reminding) return; reminding = true;
    try { const n = await ctx.engine.sendReminders(); if (n) console.log(`sent ${n} volunteer reminder(s)`); } catch (e) { console.error('reminder job failed', (e as Error).message); } finally { reminding = false; }
  }, 10 * 60_000);
  const purge = setInterval(async () => {
    try { const n = await ctx.engine.purgeExpiredContacts(); if (n) console.log(`retention: purged ${n} contact number(s)`); } catch (e) { console.error('retention purge failed', (e as Error).message); }
  }, 24 * 3600_000);
  poll.unref(); remind.unref(); purge.unref();
  return () => { clearInterval(poll); clearInterval(remind); clearInterval(purge); };
}
