import { z } from 'zod';
export const reportType = z.enum(['standing_water', 'hotspot', 'drainage', 'other']);
const point = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) });
const phone = z.string().min(10).max(20);
const photo = z.string().min(100).max(7_200_000); // base64 of a <=5 MB JPEG/PNG
export const createReport = z.object({ phone, type: reportType, areaId: z.string().min(1), landmark: z.string().max(60).optional(), location: point.optional(), consentToUpdates: z.boolean().default(false), photoBase64: photo.optional(), consentToStoreEvidence: z.boolean().default(false), idempotencyKey: z.string().min(8).max(100).optional() })
  .refine((b) => !b.photoBase64 || b.consentToStoreEvidence, { message: 'consentToStoreEvidence must be true to attach a photo', path: ['consentToStoreEvidence'] });
export const approveBody = z.object({ notDuplicate: z.boolean().default(false), notes: z.string().max(500).optional() });
export const overrideBody = z.object({ category: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), reason: z.string().min(3).max(300) });
export const evidenceBody = z.object({ photoBase64: photo });
export const reasonBody = z.object({ reason: z.string().min(3).max(300), notes: z.string().max(500).optional() });
export const notesBody = z.object({ notes: z.string().max(500).optional() });
export const assignBody = z.object({ assigneeId: z.string().min(1), notes: z.string().max(500).optional() });
export const listReports = z.object({ q: z.string().max(50).optional(), status: z.string().optional(), areaId: z.string().optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(), sort: z.enum(['newest', 'oldest', 'priority']).default('newest') });
export const registerVolunteer = z.object({ name: z.string().min(2).max(80), areaIds: z.array(z.string()).max(10).default([]) });
export const requestOtp = z.object({ phone });
export const verifyOtp = z.object({ otp: z.string().regex(/^\d{4,8}$/) });
export const setRole = z.object({ role: z.enum(['volunteer', 'coordinator', 'admin']), name: z.string().min(2).max(80).optional() });
export const approve = z.object({ approved: z.boolean() });
export const availability = z.object({ isAvailable: z.boolean() });
export const alertBody = z.object({ areaId: z.string().min(1), tip: z.string().max(100).optional() });
export const simUssd = z.object({ sessionId: z.string().min(1), msisdn: z.string().min(10), text: z.string().max(200).default('') });
export const simSms = z.object({ from: z.string().min(10), text: z.string().max(300) });
