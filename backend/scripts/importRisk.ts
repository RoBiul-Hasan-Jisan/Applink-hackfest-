// Imports exported ML/rules predictions. The backend never trains models. Estimates that are not "validated" are stored for
// context but are NEVER used by the priority engine.   usage: node scripts/importRisk.ts [path]  (default ../ml/outputs/risk_predictions.json)
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../src/config/env.ts';
import { Area, RiskScore } from '../src/models/index.ts';

const row = z.object({ areaName: z.string(), geographicLevel: z.enum(['ward', 'area', 'upazila', 'district', 'division']), date: z.coerce.date(), score: z.number().min(0).max(100), level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
  topFactors: z.array(z.object({ name: z.string(), contribution: z.number() })).default([]), modelVersion: z.string().min(1), dataCoverage: z.string().min(1), evaluationStatus: z.enum(['validated', 'not_validated', 'rules_based_fallback']) });
const path = process.argv[2] ?? new URL('../../ml/outputs/risk_predictions.json', import.meta.url).pathname;
const rows = z.array(row).parse(JSON.parse(await readFile(path, 'utf8')));
await mongoose.connect(env.MONGODB_URI);
let ok = 0; const missing = new Set<string>();
for (const r of rows) {
  const a = await Area.findOne({ name: r.areaName, type: r.geographicLevel }); if (!a) { missing.add(`${r.areaName} (${r.geographicLevel})`); continue; }
  const { areaName: _n, ...rest } = r; void _n;
  await RiskScore.updateOne({ areaId: a._id, date: r.date, modelVersion: r.modelVersion }, { $set: { ...rest, areaId: a._id, isEstimate: true } }, { upsert: true }); ok++;
}
console.log(`imported ${ok}/${rows.length}`); if (missing.size) console.warn('unmatched areas (create them first):', [...missing]);
await mongoose.disconnect();
