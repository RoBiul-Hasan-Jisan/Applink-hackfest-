import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { ah, actorFor, serializeReport, storeEvidence, type Ctx } from '../controllers/support.ts';
import * as v from '../validators/index.ts';
import { EngineError } from '../domain/engine.ts';

export function integrityRoutes(ctx: Ctx): Router {
  const r = Router(), { store, engine } = ctx, staff = requireRole('coordinator', 'admin');

  // Data integrity center: provenance and honesty about what the numbers are (and are not).
  r.get('/api/integrity', requireAuth, staff, ah(async (_q, res) => {
    const [reports, areas, stats] = await Promise.all([store.listReports(), store.listAreas(), store.messageStats()]);
    const real = reports.filter((x) => !x.isSynthetic), tally = <T extends string>(xs: T[]) => xs.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
    const risk = (await Promise.all(areas.map(async (a) => ({ area: a.name, latest: await store.latestRisk(a.id) })))).filter((x) => x.latest)
      .map((x) => ({ area: x.area, date: x.latest!.date, modelVersion: x.latest!.modelVersion, evaluationStatus: x.latest!.evaluationStatus, dataCoverage: x.latest!.dataCoverage, usedForPriority: x.latest!.evaluationStatus === 'validated' }));
    res.json({
      generatedAt: new Date(), policy: 'Only genuine observations are counted. Records flagged synthetic (test fixtures / simulator) are excluded from every figure. Missing data stays missing.',
      reports: { total: real.length, excludedSynthetic: reports.length - real.length, bySource: tally(real.map((x) => x.source)), byStatus: tally(real.map((x) => x.status)), byEvidenceCompleteness: tally(real.map((x) => x.evidenceCompleteness)) },
      evidence: real.flatMap((x) => x.evidence.map((e) => ({ id: e.id, reportCode: x.reportCode, kind: e.kind, mime: e.mime, bytes: e.bytes, sha256: e.sha256, uploadedAt: e.uploadedAt, deleted: !!e.deletedAt }))),
      priority: { ruleVersions: [...new Set(real.map((x) => x.priorityRuleVersion))], overrides: real.filter((x) => x.priorityOverride).length },
      risk, riskNote: 'Risk estimates are shown for context. Only estimates with evaluationStatus "validated" ever influence priority.',
      telecom: { ...stats, note: 'accepted = the provider accepted our request; delivered = a delivery report said so. Accepted is not delivered.' },
      mode: ctx.mode,
    });
  }));
  r.get('/api/telecom', requireAuth, staff, ah(async (_q, res) => {
    res.json({ mode: ctx.mode, stats: await store.messageStats(), recent: (await store.listMessages(100)).map(({ toHash, ...m }) => ({ ...m, to: `#${toHash.slice(0, 6)}` })) });
  }));

  r.post('/api/reports/:id/evidence', requireAuth, requireRole('volunteer', 'coordinator', 'admin'), ah(async (req, res) => {
    const { photoBase64 } = v.evidenceBody.parse(req.body), actor = await actorFor(ctx, req);
    const ref = await storeEvidence(ctx, photoBase64, 'action', actor.id);
    res.status(201).json(serializeReport(await engine.addEvidence(String(req.params.id), actor, ref)));
  }));
  r.get('/api/evidence/:id', requireAuth, requireRole('volunteer', 'coordinator', 'admin'), ah(async (req, res) => {
    const id = String(req.params.id);
    const rep = (await store.listReports()).find((x) => x.evidence.some((e) => e.id === id)); if (!rep) throw new EngineError('NOT_FOUND');
    if (req.auth!.role === 'volunteer') { const u = await store.getUserByFirebaseUid(req.auth!.uid); if (rep.assignedTo !== u?.id) throw new EngineError('FORBIDDEN'); }
    const buf = await ctx.storage.get(id); if (!buf) throw new EngineError('NOT_FOUND');
    res.set({ 'Content-Type': rep.evidence.find((e) => e.id === id)!.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(buf);
  }));
  return r;
}
