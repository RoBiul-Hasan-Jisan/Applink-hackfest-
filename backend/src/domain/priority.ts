// Versioned, explicit, deterministic priority rules (CARE "urgency" leg). Weights are configurable DEFAULTS, not validated coefficients.
// Area risk participates ONLY when a *validated* estimate exists; otherwise its weight is redistributed and the report says so.
export type ReportType = 'standing_water' | 'hotspot' | 'drainage' | 'other';
export type PriorityCategory = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const PRIORITY_RULE_VERSION = 'rules-v1';
export interface PriorityConfig {
  weights: { risk: number; nearby: number; age: number; type: number };
  typeScores: Record<ReportType, number>;
  nearbyCap: number; ageCapHours: number; reopenedFloor: number;
}
export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  weights: { risk: 0.4, nearby: 0.3, age: 0.2, type: 0.1 },
  typeScores: { standing_water: 70, hotspot: 100, drainage: 60, other: 30 },
  nearbyCap: 10, ageCapHours: 72, reopenedFloor: 50,
};
export interface PriorityInput {
  areaRiskScore: number | null; // pass null unless the estimate is validated
  nearbyOpenCount: number; ageHours: number; type: ReportType; reopened?: boolean;
}
export interface PriorityResult {
  score: number; category: PriorityCategory; reasons: string[]; ruleVersion: string;
  components: { risk: number | null; nearby: number; age: number; type: number };
}
const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (x: number) => `${r1(x * 100)}%`;

export function categorize(score: number): PriorityCategory {
  if (score < 25) return 'LOW'; if (score < 50) return 'MEDIUM'; if (score < 75) return 'HIGH'; return 'CRITICAL';
}
export function validateConfig(c: PriorityConfig): void {
  const sum = Object.values(c.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`priority weights must sum to 1 (got ${sum})`);
}
export function computePriority(input: PriorityInput, cfg: PriorityConfig = DEFAULT_PRIORITY_CONFIG): PriorityResult {
  validateConfig(cfg);
  const reasons: string[] = [], useRisk = input.areaRiskScore !== null;
  const rest = 1 - (useRisk ? 0 : cfg.weights.risk);
  const w = { risk: useRisk ? cfg.weights.risk : 0, nearby: cfg.weights.nearby / rest, age: cfg.weights.age / rest, type: cfg.weights.type / rest };
  const risk = useRisk ? clamp(input.areaRiskScore!) : null;
  const nearby = clamp((Math.max(0, input.nearbyOpenCount) / cfg.nearbyCap) * 100), age = clamp((Math.max(0, input.ageHours) / cfg.ageCapHours) * 100), type = clamp(cfg.typeScores[input.type]);
  let score = r1((risk ?? 0) * w.risk + nearby * w.nearby + age * w.age + type * w.type);

  reasons.push(useRisk ? `Validated area risk estimate ${risk}/100 (${pct(w.risk)} weight)` : 'Area risk not used: no validated estimate available; its weight is redistributed to the other factors');
  reasons.push(`${input.nearbyOpenCount} open report(s) nearby -> ${r1(nearby)}/100 (${pct(w.nearby)} weight)`);
  reasons.push(`Report age ${r1(input.ageHours)}h -> ${r1(age)}/100 (${pct(w.age)} weight)`);
  reasons.push(`Observation type "${input.type}" -> ${type}/100 (${pct(w.type)} weight)`);
  reasons.push(`Rule version ${PRIORITY_RULE_VERSION}. This ranks review/inspection order only; it is not a confirmed breeding site or infection risk.`);
  if (input.reopened && score < cfg.reopenedFloor) { reasons.push(`Reopened: escalated to minimum ${cfg.reopenedFloor}`); score = cfg.reopenedFloor; }
  return { score, category: categorize(score), reasons, ruleVersion: PRIORITY_RULE_VERSION, components: { risk: risk === null ? null : r1(risk), nearby: r1(nearby), age: r1(age), type } };
}
