export type Status = 'NEW' | 'APPROVED' | 'ASSIGNED' | 'ACCEPTED' | 'CLEANED' | 'VERIFIED' | 'REJECTED' | 'REOPENED';
export interface HistoryEntry { actorId: string; actorRole: string; at: string; from: Status; to: Status; action: string; notes?: string; reason?: string }
export interface Evidence { id: string; sha256: string; mime: string; bytes: number; kind: 'report' | 'action'; uploadedAt: string }
export interface Report {
  id: string; reportCode: string; type: string; areaId: string; area?: string; landmark: string | null; status: Status; priorityScore: number; priorityCategory: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priorityReasons: string[]; careNotes: string[]; evidenceCompleteness: 'COMPLETE' | 'PARTIAL' | 'MINIMAL'; evidence: Evidence[]; duplicateOf: string | null; assignedTo: string | null;
  assignee?: { id: string; name: string; phoneVerified: boolean } | null; riskLevelAtCreation: string | null; residentConfirmed: boolean | null; source: string; reporter: string; history: HistoryEntry[]; createdAt: string; evidenceNote: string | null;
  priorityOverride: { category: string; reason: string; by: string; at: string } | null;
}
export interface Area { id: string; name: string; type: string; centroid: { lng: number; lat: number } | null }
export interface Volunteer { id: string; name: string; phoneVerified: boolean; identityApproved: boolean; isAvailable: boolean; areaIds: string[]; activeTasks: number; completedTasks: number }
