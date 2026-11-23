import { api, patch } from '@/lib/api';
import type { Area, Report, Volunteer } from '@/types';
export const listReports = (qs = '') => api<Report[]>(`/reports${qs}`);
export const reviewQueue = () => api<Report[]>('/review-queue');
export const getReport = (id: string) => api<Report>(`/reports/${id}`);
export const listAreas = () => api<Area[]>('/areas');
export const listVolunteers = () => api<Volunteer[]>('/volunteers');
export const act = (id: string, action: string, body: object = {}) => patch<Report>(`/reports/${id}/${action}`, body);
