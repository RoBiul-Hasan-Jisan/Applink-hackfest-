import type { ReportRec, UserRec } from '../domain/types.ts';
export const analyticsVolunteerRow = (u: UserRec, rs: ReportRec[]) => ({
  id: u.id, name: u.name, phoneVerified: u.phoneVerified, identityApproved: u.identityApproved, isAvailable: u.isAvailable, areaIds: u.areaIds,
  activeTasks: rs.filter((r) => r.assignedTo === u.id && (r.status === 'ASSIGNED' || r.status === 'ACCEPTED')).length,
  completedTasks: rs.filter((r) => r.history.some((h) => h.action === 'clean' && h.actorId === u.id)).length, isSynthetic: u.isSynthetic,
});
