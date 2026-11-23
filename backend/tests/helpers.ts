import { randomBytes } from 'node:crypto';
import { MemoryStore } from '../src/domain/memory-store.ts';
import { createEngine, defaultEngineConfig, type EngineConfig } from '../src/domain/engine.ts';
import { createSimulatorGateways } from '../src/integrations/simulator.ts';
import { MemoryEvidenceStorage } from '../src/integrations/storage.ts';
import { encryptPhone, hashPhone } from '../src/domain/phone-crypto.ts';
import type { UserRec, AreaRec } from '../src/domain/types.ts';

export const SECRET = 'test-hash-secret-0123456789', KEY = randomBytes(32).toString('base64');
export function setup(over: Partial<EngineConfig> = {}) {
  const clock = { t: new Date('2026-11-21T10:00:00Z') };
  const now = () => new Date(clock.t);
  const store = new MemoryStore(now), gw = createSimulatorGateways();
  const cfg = defaultEngineConfig({ phoneHashSecret: SECRET, phoneEncryptionKey: KEY }, over);
  const storage = new MemoryEvidenceStorage(), engine = createEngine({ store, sms: gw.sms, otp: gw.otp, storage, cfg, clock: now });
  const A1: AreaRec = { id: 'A1', name: 'Khulshi', type: 'area', centroid: null }, A2: AreaRec = { id: 'A2', name: 'Pahartali', type: 'area', centroid: null };
  store.areas.set('A1', A1); store.areas.set('A2', A2);
  store.risks.push({ areaId: 'A1', geographicLevel: 'area', date: new Date('2026-11-01'), score: 80, level: 'HIGH', topFactors: [], modelVersion: 'test', dataCoverage: 'test', evaluationStatus: 'not_validated' });
  const mkUser = async (id: string, role: UserRec['role'], phone: string | null, o: Partial<UserRec> = {}): Promise<UserRec> => {
    const u: UserRec = { id, firebaseUid: `fb-${id}`, name: id, role, phoneHash: phone ? hashPhone(phone, SECRET) : null, phoneEncrypted: phone ? encryptPhone(phone, KEY) : null,
      phoneVerified: true, identityApproved: true, areaIds: ['A1'], isAvailable: true, location: null, otpRef: null, otpExpiresAt: null, otpAttempts: 0, isSynthetic: true, createdAt: now(), ...o };
    await store.saveUser(u); return u;
  };
  const to = (phone: string) => gw.sms.outbox.filter((m) => m.to === phone);
  const inbound = async (from: string, text: string) => { gw.sms.receive(from, text); await engine.pollInboundSms(); };
  return { store, gw, storage, engine, cfg, clock, mkUser, to, inbound };
}
export const RES = '8801711000001', VOL = '8801722000001', RES2 = '8801711000002';
export const ussdReport = async (e: ReturnType<typeof setup>, phone = RES, sid = 'S1', consent = '1') => {
  let r = await e.engine.ussd({ sessionId: sid, phone, text: '' });
  for (const t of ['1', '1', 'near mosque', consent]) r = await e.engine.ussd({ sessionId: sid, phone, text: t });
  return r;
};

export const reviewer = (e: ReturnType<typeof setup>) => e.mkUser('rev1', 'coordinator', null);
/** Human review: the only way a report becomes dispatchable. */
export const approve = async (e: ReturnType<typeof setup>, code: string, notDuplicate = false) => {
  const r = (await e.store.getReportByCode(code))!; const rev = (await e.store.getUser('rev1')) ?? (await reviewer(e));
  return e.engine.transition(r.id, 'approve', await e.engine.actorForUser(rev), { notDuplicate });
};
