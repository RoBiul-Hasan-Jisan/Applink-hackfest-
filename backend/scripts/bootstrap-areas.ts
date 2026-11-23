// Loads REAL reference geography (areas the pilot site actually uses). Creates NO reports, volunteers or risk data.
// usage: node scripts/bootstrap-areas.ts [path-to-json]   (default ../data/areas.json; see ../data/areas.template.json)
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../src/config/env.ts';
import { Area } from '../src/models/index.ts';

const schema = z.array(z.object({ name: z.string().min(2), type: z.enum(['ward', 'area', 'upazila', 'district', 'division']), lat: z.number().optional(), lng: z.number().optional() })).min(1);
const path = process.argv[2] ?? new URL('../../data/areas.json', import.meta.url).pathname;
const areas = schema.parse(JSON.parse(await readFile(path, 'utf8')));
if (areas.some((a) => /EDIT ME/i.test(a.name))) throw new Error('areas file still contains template placeholders: replace them with the real pilot-site areas');
await mongoose.connect(env.MONGODB_URI);
for (const a of areas) await Area.updateOne({ name: a.name, type: a.type }, { $set: { name: a.name, type: a.type, ...(a.lat !== undefined && a.lng !== undefined ? { centroid: { type: 'Point', coordinates: [a.lng, a.lat] } } : {}) } }, { upsert: true });
console.log(`upserted ${areas.length} area(s)`); await mongoose.disconnect();
