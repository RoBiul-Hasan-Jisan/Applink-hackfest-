// Pure report-lifecycle state machine. No I/O. Every status change goes through applyAction().
export const STATUSES = ['NEW', 'APPROVED', 'ASSIGNED', 'ACCEPTED', 'CLEANED', 'VERIFIED', 'REJECTED', 'REOPENED'] as const;
export type Status = (typeof STATUSES)[number];
export type ActorRole = 'resident' | 'volunteer' | 'coordinator' | 'admin' | 'system';
export type Action = 'approve' | 'assign' | 'decline' | 'accept' | 'clean' | 'verify' | 'reject' | 'reopen';

export interface Actor {
  id: string;
  role: ActorRole;
  phoneVerified?: boolean; // volunteers
  identityApproved?: boolean; // volunteers (admin approval)
  phoneHash?: string; // residents
}
export interface WorkflowReport {
  status: Status;
  assignedTo: string | null;
  reporterPhoneHash: string;
}
export interface HistoryEntry {
  actorId: string;
  actorRole: ActorRole;
  at: Date;
  from: Status;
  to: Status;
  action: Action | 'create';
  notes?: string;
  reason?: string;
}
export type WorkflowErrorCode =
  | 'INVALID_TRANSITION' | 'FORBIDDEN_ROLE' | 'VOLUNTEER_NOT_ELIGIBLE'
  | 'NOT_ASSIGNEE' | 'NOT_REPORTER' | 'REASON_REQUIRED' | 'ASSIGNEE_REQUIRED';

export class WorkflowError extends Error {
  code: WorkflowErrorCode;
  constructor(code: WorkflowErrorCode, message: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
  }
}

interface Rule { from: Status[]; to: Status; roles: ActorRole[]; requiresReason?: boolean }

// Lifecycle: NEW(review pending) > APPROVED (human review) > ASSIGNED > ACCEPTED > CLEANED > VERIFIED; NEW>REJECTED; ASSIGNED|CLEANED|VERIFIED>REOPENED.
// ADDITIONS vs. the original spec (see docs): approve (review gate), decline (ASSIGNED>APPROVED), re-assign (REOPENED>ASSIGNED).
export const RULES: Record<Action, Rule> = {
  approve: { from: ['NEW'], to: 'APPROVED', roles: ['coordinator', 'admin'] }, // human evidence review BEFORE any dispatch
  assign: { from: ['APPROVED', 'REOPENED'], to: 'ASSIGNED', roles: ['system', 'coordinator', 'admin'] },
  decline: { from: ['ASSIGNED'], to: 'APPROVED', roles: ['volunteer'], requiresReason: true },
  accept: { from: ['ASSIGNED'], to: 'ACCEPTED', roles: ['volunteer'] },
  clean: { from: ['ACCEPTED'], to: 'CLEANED', roles: ['volunteer'] },
  verify: { from: ['CLEANED'], to: 'VERIFIED', roles: ['coordinator', 'admin'] },
  reject: { from: ['NEW', 'APPROVED'], to: 'REJECTED', roles: ['coordinator', 'admin'], requiresReason: true },
  reopen: { from: ['ASSIGNED', 'CLEANED', 'VERIFIED'], to: 'REOPENED', roles: ['resident', 'coordinator', 'admin'], requiresReason: true },
};

export interface ActionOptions { notes?: string; reason?: string; assigneeId?: string; notDuplicate?: boolean }
export interface ActionResult { status: Status; assignedTo: string | null; entry: HistoryEntry }

export function applyAction(
  report: WorkflowReport, action: Action, actor: Actor, opts: ActionOptions = {}, now: Date = new Date(),
): ActionResult {
  const rule = RULES[action];
  if (!rule.roles.includes(actor.role)) throw new WorkflowError('FORBIDDEN_ROLE', `${actor.role} cannot ${action}`);
  if (!rule.from.includes(report.status))
    throw new WorkflowError('INVALID_TRANSITION', `cannot ${action} a report in status ${report.status}`);

  if (actor.role === 'volunteer') {
    if (!actor.identityApproved || !actor.phoneVerified)
      throw new WorkflowError('VOLUNTEER_NOT_ELIGIBLE', 'volunteer must be admin-approved and phone-verified');
    if (report.assignedTo !== actor.id) throw new WorkflowError('NOT_ASSIGNEE', 'report is not assigned to this volunteer');
  }
  if (actor.role === 'resident' && (!actor.phoneHash || actor.phoneHash !== report.reporterPhoneHash))
    throw new WorkflowError('NOT_REPORTER', 'only the original reporter may do this');
  if (rule.requiresReason && !opts.reason?.trim()) throw new WorkflowError('REASON_REQUIRED', `${action} requires a reason`);
  if (action === 'assign' && !opts.assigneeId) throw new WorkflowError('ASSIGNEE_REQUIRED', 'assign requires assigneeId');

  let assignedTo = report.assignedTo;
  if (action === 'assign') assignedTo = opts.assigneeId!;
  if (action === 'decline') assignedTo = null;

  const entry: HistoryEntry = {
    actorId: actor.id, actorRole: actor.role, at: now, from: report.status, to: rule.to, action,
    ...(opts.notes ? { notes: opts.notes } : {}), ...(opts.reason ? { reason: opts.reason.trim() } : {}),
  };
  return { status: rule.to, assignedTo, entry };
}

export const OPEN_STATUSES: readonly Status[] = ['NEW', 'APPROVED', 'ASSIGNED', 'ACCEPTED', 'REOPENED'];
export const isOpen = (s: Status): boolean => OPEN_STATUSES.includes(s);
