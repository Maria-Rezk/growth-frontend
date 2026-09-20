import { describe, expect, it } from 'vitest';
import {
  STATUS_OPTIONS,
  byWaitingLongest,
  canReview,
  canSubmitForReview,
  formatWaiting,
  isWaitingLong,
  needsApprover,
} from './taskReview';

const assignee = { userId: 'jessika', isAdmin: false };
const approver = { userId: 'omar', isAdmin: false };
const bystander = { userId: 'yasin', isAdmin: false };
const admin = { userId: 'admin', isAdmin: true };

const task = { status: 'IN_PROGRESS' as const, assignedToId: 'jessika', approverId: 'omar' };

describe('status control', () => {
  it('never offers IN_REVIEW — the status endpoint refuses it in both directions', () => {
    expect(STATUS_OPTIONS).not.toContain('IN_REVIEW');
    expect(STATUS_OPTIONS).toContain('CANCELED');
  });
});

describe('canSubmitForReview', () => {
  it('is the assignee or an admin, from TODO or IN_PROGRESS', () => {
    expect(canSubmitForReview(task, assignee)).toBe(true);
    expect(canSubmitForReview({ ...task, status: 'TODO' }, assignee)).toBe(true);
    expect(canSubmitForReview(task, admin)).toBe(true);
  });

  it('refuses everybody else, and any other status', () => {
    expect(canSubmitForReview(task, approver)).toBe(false);
    expect(canSubmitForReview(task, bystander)).toBe(false);
    expect(canSubmitForReview({ ...task, status: 'DONE' }, assignee)).toBe(false);
    expect(canSubmitForReview({ ...task, status: 'IN_REVIEW' }, assignee)).toBe(false);
    expect(canSubmitForReview({ ...task, status: 'BLOCKED' }, assignee)).toBe(false);
  });

  it('does not depend on an approver being set — that is the 422 the picker handles', () => {
    const { approverId: _ignored, ...withoutApprover } = task;
    expect(canSubmitForReview(withoutApprover, assignee)).toBe(true);
  });
});

describe('canReview', () => {
  const inReview = { ...task, status: 'IN_REVIEW' as const };

  it('is the approver or an admin, only while in review', () => {
    expect(canReview(inReview, approver)).toBe(true);
    expect(canReview(inReview, admin)).toBe(true);
    expect(canReview(inReview, assignee)).toBe(false);
    expect(canReview(inReview, bystander)).toBe(false);
    expect(canReview(task, approver)).toBe(false);
  });

  it('lets an admin decide a task that has no approver at all', () => {
    expect(canReview({ ...inReview, approverId: null }, admin)).toBe(true);
    expect(canReview({ ...inReview, approverId: null }, approver)).toBe(false);
  });
});

describe('needsApprover', () => {
  it('flags only tasks that are in review with nobody named', () => {
    expect(needsApprover({ status: 'IN_REVIEW', approverId: null })).toBe(true);
    expect(needsApprover({ status: 'IN_REVIEW', approverId: 'omar' })).toBe(false);
    expect(needsApprover({ status: 'TODO', approverId: null })).toBe(false);
  });
});

describe('waiting age', () => {
  const now = new Date('2026-09-20T12:00:00Z').getTime();

  it('formats from submittedForReviewAt', () => {
    expect(formatWaiting('2026-09-20T11:59:50Z', now)).toBe('just now');
    expect(formatWaiting('2026-09-20T11:20:00Z', now)).toBe('40m');
    expect(formatWaiting('2026-09-20T03:00:00Z', now)).toBe('9h');
    expect(formatWaiting('2026-09-18T09:00:00Z', now)).toBe('2d 3h');
    expect(formatWaiting('2026-09-17T12:00:00Z', now)).toBe('3d');
    expect(formatWaiting(null, now)).toBe('—');
  });

  it('calls a day or more "long"', () => {
    expect(isWaitingLong('2026-09-19T12:00:00Z', now)).toBe(true);
    expect(isWaitingLong('2026-09-19T12:00:01Z', now)).toBe(false);
    expect(isWaitingLong(undefined, now)).toBe(false);
  });

  it('sorts oldest submission first', () => {
    const rows = [
      { submittedForReviewAt: '2026-09-19T12:00:00Z' },
      { submittedForReviewAt: '2026-09-17T12:00:00Z' },
      { submittedForReviewAt: '2026-09-18T12:00:00Z' },
    ];
    expect([...rows].sort(byWaitingLongest).map((row) => row.submittedForReviewAt)).toEqual([
      '2026-09-17T12:00:00Z',
      '2026-09-18T12:00:00Z',
      '2026-09-19T12:00:00Z',
    ]);
  });
});
