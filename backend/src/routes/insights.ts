import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { ah, actorFor, type Ctx } from '../controllers/support.ts';
import * as v from '../validators/index.ts';
import { EngineError } from '../domain/engine.ts';
import * as an from '../domain/analytics.ts';
import { estimateCost, DEFAULT_RATES, REPORT_FLOW, lifecycleUsage } from '../domain/cost.ts';

export function insightRoutes(ctx: Ctx): Router {
  const r = Router(), { store, engine } = ctx, staff = requireRole('coordinator', 'admin'), any = requireRole('volunteer', 'coordinator', 'admin');
  // Production analytics never include records flagged synthetic (test fixtures / dev simulator data).
  const realReports = async () => (await store.listReports()).filter((x) => !x.isSynthetic);
  const campaignLimit = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  r.get('/api/areas', requireAuth, any, ah(async (_q, res) => { res.json(await store.listAreas()); }));
  r.get('/api/areas/:id', requireAuth, any, ah(async (req, res) => { const a = await store.getArea(String(req.params.id)); if (!a) throw new EngineError('NOT_FOUND'); res.json(a); }));
  r.get('/api/risk', requireAuth, any, ah(async (_q, res) => {
    const areas = await store.listAreas();
    const rows = await Promise.all(areas.map(async (a) => ({ area: a, risk: await store.latestRisk(a.id) })));
    res.json({ disclaimer: 'Risk values are model/rules-based ESTIMATES, not confirmed outbreaks. Check evaluationStatus and dataCoverage for limits.', items: rows });
  }));
  r.get('/api/risk/:areaId/history', requireAuth, any, ah(async (req, res) => { res.json(await store.riskHistory(String(req.params.areaId))); }));

  r.get('/api/analytics/summary', requireAuth, staff, ah(async (_q, res) => {
    const [rs, us] = await Promise.all([realReports(), store.listUsers()]);
    res.json(an.summary(rs, us));
  }));
  r.get('/api/analytics/reports', requireAuth, staff, ah(async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days ?? 14))), [rs, areas, us] = await Promise.all([realReports(), store.listAreas(), store.listUsers()]);
    res.json({ daily: an.dailyReports(rs, days, new Date()), byArea: an.byArea(rs, new Map(areas.map((a) => [a.id, a.name]))), priority: an.priorityDistribution(rs), volunteers: an.volunteerPerformance(rs, us) });
  }));
  r.get('/api/analytics/response-performance', requireAuth, staff, ah(async (_q, res) => { res.json(an.responsePerformance(await realReports(), ctx.slaHours)); }));
  r.get('/api/analytics/risk-trends', requireAuth, staff, ah(async (_q, res) => {
    const areas = await store.listAreas();
    res.json(await Promise.all(areas.map(async (a) => ({ area: a.name, series: (await store.riskHistory(a.id)).map((x) => ({ date: x.date, score: x.score, level: x.level, modelVersion: x.modelVersion, evaluationStatus: x.evaluationStatus })) }))));
  }));

  r.post('/api/campaigns/alert', requireAuth, staff, campaignLimit, ah(async (req, res) => {
    const b = v.alertBody.parse(req.body); res.status(201).json(await engine.sendAreaAlert({ areaId: b.areaId, actor: await actorFor(ctx, req), ...(b.tip ? { tip: b.tip } : {}) }));
  }));
  r.get('/api/campaigns', requireAuth, staff, ah(async (_q, res) => { res.json(await store.listCampaigns()); }));
  r.get('/api/messages', requireAuth, staff, ah(async (_q, res) => {
    res.json((await store.listMessages(200)).map(({ toHash, ...m }) => ({ ...m, to: `#${toHash.slice(0, 6)}` }))); // pseudonymous reference only
  }));
  r.get('/api/audit', requireAuth, requireRole('admin'), ah(async (_q, res) => { res.json(await store.listAudit(200)); }));
  r.get('/api/settings/usage', requireAuth, staff, ah(async (_q, res) => {
    res.json({ mode: ctx.mode, rates: DEFAULT_RATES, ratesNote: 'Assumed from published figures in the project brief; verify approved pricing before production.',
      reportFlow: { usage: REPORT_FLOW, estimatedBdt: estimateCost(REPORT_FLOW) }, fullLifecycle: { usage: lifecycleUsage(), estimatedBdt: estimateCost(lifecycleUsage()) }, smsLanguage: ctx.smsLanguage });
  }));
  return r;
}
