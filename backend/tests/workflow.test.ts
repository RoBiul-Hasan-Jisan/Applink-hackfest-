import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, WorkflowError, type Actor, type WorkflowReport } from '../src/domain/workflow.ts';

const vol: Actor = { id: 'v1', role: 'volunteer', phoneVerified: true, identityApproved: true };
const coord: Actor = { id: 'c1', role: 'coordinator' };
const mk = (status: WorkflowReport['status'], assignedTo: string | null = null): WorkflowReport => ({ status, assignedTo, reporterPhoneHash: 'h1' });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as WorkflowError).code; } return 'NO_ERROR'; };

test('happy path NEW>APPROVED>ASSIGNED>ACCEPTED>CLEANED>VERIFIED with history', () => {
  let r = mk('NEW'); const hist = [];
  const steps: [Parameters<typeof applyAction>[1], Actor, object][] = [
    ['approve', coord, {}], ['assign', { id: 'sys', role: 'system' }, { assigneeId: 'v1' }], ['accept', vol, {}], ['clean', vol, { notes: 'cleared tank' }], ['verify', coord, {}],
  ];
  for (const [a, actor, o] of steps) { const res = applyAction(r, a, actor, o); hist.push(res.entry); r = { ...r, status: res.status, assignedTo: res.assignedTo }; }
  assert.equal(r.status, 'VERIFIED');
  assert.deepEqual(hist.map((h) => `${h.from}>${h.to}`), ['NEW>APPROVED', 'APPROVED>ASSIGNED', 'ASSIGNED>ACCEPTED', 'ACCEPTED>CLEANED', 'CLEANED>VERIFIED']);
});
test('REVIEW GATE: nothing can be assigned or accepted before human approval', () => {
  assert.equal(code(() => applyAction(mk('NEW'), 'assign', { id: 'sys', role: 'system' }, { assigneeId: 'v1' })), 'INVALID_TRANSITION');
  assert.equal(code(() => applyAction(mk('NEW'), 'approve', { id: 'sys', role: 'system' })), 'FORBIDDEN_ROLE');
  assert.equal(code(() => applyAction(mk('NEW'), 'approve', vol)), 'FORBIDDEN_ROLE');
  assert.equal(code(() => applyAction(mk('NEW', 'v1'), 'accept', vol)), 'INVALID_TRANSITION');
  assert.equal(applyAction(mk('NEW'), 'reject', coord, { reason: 'not a hazard' }).status, 'REJECTED');
  assert.equal(code(() => applyAction(mk('NEW'), 'reject', coord)), 'REASON_REQUIRED');
});
test('arbitrary transitions are rejected', () => {
  assert.equal(code(() => applyAction(mk('NEW'), 'verify', coord)), 'INVALID_TRANSITION');
  assert.equal(code(() => applyAction(mk('ASSIGNED', 'v1'), 'clean', vol)), 'INVALID_TRANSITION');
  assert.equal(code(() => applyAction(mk('VERIFIED', 'v1'), 'accept', vol)), 'INVALID_TRANSITION');
  assert.equal(code(() => applyAction(mk('REJECTED'), 'reopen', coord, { reason: 'x' })), 'INVALID_TRANSITION');
});
test('role and eligibility enforcement', () => {
  assert.equal(code(() => applyAction(mk('CLEANED'), 'verify', vol)), 'FORBIDDEN_ROLE');
  assert.equal(code(() => applyAction(mk('ASSIGNED', 'v1'), 'accept', { ...vol, phoneVerified: false })), 'VOLUNTEER_NOT_ELIGIBLE');
  assert.equal(code(() => applyAction(mk('ASSIGNED', 'v1'), 'accept', { ...vol, identityApproved: false })), 'VOLUNTEER_NOT_ELIGIBLE');
  assert.equal(code(() => applyAction(mk('ASSIGNED', 'v2'), 'accept', vol)), 'NOT_ASSIGNEE');
  assert.equal(code(() => applyAction(mk('APPROVED'), 'assign', coord)), 'ASSIGNEE_REQUIRED');
});
test('reopen: reporter-only for residents, reason required, allowed from ASSIGNED/CLEANED/VERIFIED', () => {
  const res: Actor = { id: 'r', role: 'resident', phoneHash: 'h1' };
  for (const s of ['ASSIGNED', 'CLEANED', 'VERIFIED'] as const) assert.equal(applyAction(mk(s, 'v1'), 'reopen', res, { reason: 'still there' }).status, 'REOPENED');
  assert.equal(code(() => applyAction(mk('VERIFIED'), 'reopen', { ...res, phoneHash: 'other' }, { reason: 'x' })), 'NOT_REPORTER');
  assert.equal(code(() => applyAction(mk('VERIFIED'), 'reopen', res)), 'REASON_REQUIRED');
  assert.equal(code(() => applyAction(mk('ACCEPTED', 'v1'), 'reopen', res, { reason: 'x' })), 'INVALID_TRANSITION');
});
test('decline clears assignee and returns to APPROVED; REOPENED can be re-assigned', () => {
  const d = applyAction(mk('ASSIGNED', 'v1'), 'decline', vol, { reason: 'out of town' });
  assert.deepEqual([d.status, d.assignedTo], ['APPROVED', null]);
  assert.equal(code(() => applyAction(mk('ASSIGNED', 'v1'), 'decline', vol)), 'REASON_REQUIRED');
  assert.equal(applyAction(mk('REOPENED'), 'assign', coord, { assigneeId: 'v2' }).assignedTo, 'v2');
});
