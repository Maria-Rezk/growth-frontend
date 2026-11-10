import { describe, expect, it } from 'vitest';
import type { Task, TaskAssignee, TaskStepStatus } from '@/types/domain';
import {
  formatDuration,
  isStepEligible,
  isStepFlow,
  liveStep,
  lockedCount,
  moveRow,
  sameSteps,
  sortSteps,
  stepActions,
  stepDurationMs,
  stepInputs,
  stepRowsFor,
} from './taskSteps';

const step = (id: string, stepOrder: number, status: TaskStepStatus, extra: Partial<TaskAssignee> = {}): TaskAssignee => ({
  id,
  userId: `user-${id}`,
  role: 'DESIGNER',
  stepOrder,
  status,
  approverId: null,
  ...extra,
});

const flow = (steps: TaskAssignee[], status: Task['status'] = 'IN_PROGRESS'): Pick<Task, 'assignees' | 'status' | 'isDraft'> => ({
  assignees: steps,
  status,
  isDraft: false,
});

describe('sortSteps', () => {
  it('orders by stepOrder whatever order the list arrived in', () => {
    const rows = [step('c', 3, 'PENDING'), step('a', 1, 'DONE'), step('b', 2, 'TODO')];
    expect(sortSteps(rows).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps list order when stepOrder is missing', () => {
    const rows = [{ ...step('x', 0, 'TODO'), stepOrder: undefined }, { ...step('y', 0, 'PENDING'), stepOrder: undefined }];
    expect(sortSteps(rows).map((row) => row.id)).toEqual(['x', 'y']);
  });
});

describe('liveStep and isStepFlow', () => {
  it('finds the one step that is TODO, IN_PROGRESS or IN_REVIEW', () => {
    const task = flow([step('a', 1, 'DONE'), step('b', 2, 'IN_REVIEW'), step('c', 3, 'PENDING')]);
    expect(liveStep(task)?.id).toBe('b');
    expect(isStepFlow(task)).toBe(true);
  });

  it('has no live step once every step is done, and a task without people is not a flow', () => {
    expect(liveStep(flow([step('a', 1, 'DONE')], 'DONE'))).toBeNull();
    expect(isStepFlow({ assignees: [] })).toBe(false);
  });
});

describe('stepActions', () => {
  const omar = 'omar';

  it('offers Start and Submit only to the live step\'s person', () => {
    const task = flow([step('a', 1, 'DONE'), step('b', 2, 'TODO'), step('c', 3, 'PENDING')]);
    expect(stepActions(task, 'user-b')).toEqual({ canStart: true, canSubmit: true, canReview: false });
    // The next person has not been reached: nothing for them yet.
    expect(stepActions(task, 'user-c')).toEqual({ canStart: false, canSubmit: false, canReview: false });
  });

  it('offers Approve / Request changes only to the live step\'s approver while it is with them', () => {
    const task = flow([step('a', 1, 'IN_REVIEW', { approverId: omar }), step('b', 2, 'PENDING')]);
    expect(stepActions(task, omar).canReview).toBe(true);
    expect(stepActions(task, 'user-a')).toEqual({ canStart: false, canSubmit: false, canReview: false });
  });

  it('offers nothing on a cancelled task or to nobody', () => {
    const task = flow([step('a', 1, 'TODO')], 'CANCELED');
    expect(stepActions(task, 'user-a').canSubmit).toBe(false);
    expect(stepActions(flow([step('a', 1, 'TODO')]), null).canSubmit).toBe(false);
  });
});

describe('time per person', () => {
  it('is completedAt minus startedAt', () => {
    const ms = stepDurationMs({ startedAt: '2026-11-01T09:00:00Z', completedAt: '2026-11-01T12:10:00Z' });
    expect(ms).toBe(190 * 60_000);
    expect(formatDuration(ms ?? 0)).toBe('3h 10m');
  });

  it('is unknown until the step has both ends', () => {
    expect(stepDurationMs({ startedAt: '2026-11-01T09:00:00Z', completedAt: null })).toBeNull();
  });

  it('reads days and minutes', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(52 * 3_600_000)).toBe('2d 4h');
  });
});

describe('the form rows', () => {
  const saved = [
    step('a', 1, 'DONE', { role: 'ACCOUNT_MANAGER', approverId: 'alice' }),
    step('b', 2, 'IN_PROGRESS', { approverId: 'omar' }),
    step('c', 3, 'PENDING', { role: 'ART_DIRECTOR' }),
  ];

  it('locks the steps that have started, in order', () => {
    const rows = stepRowsFor({ assignees: [saved[2], saved[0], saved[1]] });
    expect(rows.map((row) => [row.userId, row.locked, row.approverId])).toEqual([
      ['user-a', true, 'alice'],
      ['user-b', true, 'omar'],
      ['user-c', false, ''],
    ]);
    expect(lockedCount(rows)).toBe(2);
  });

  it('sends the whole list, in order, with an approver only where one is set', () => {
    expect(stepInputs(stepRowsFor({ assignees: saved }))).toEqual([
      { userId: 'user-a', role: 'ACCOUNT_MANAGER', approverId: 'alice' },
      { userId: 'user-b', role: 'DESIGNER', approverId: 'omar' },
      { userId: 'user-c', role: 'ART_DIRECTOR' },
    ]);
  });

  it('treats a new order or a new step approver as a change', () => {
    const inputs = stepInputs(stepRowsFor({ assignees: saved }));
    expect(sameSteps(inputs, saved)).toBe(true);
    expect(sameSteps([inputs[0], inputs[2], inputs[1]], saved)).toBe(false);
    expect(sameSteps([inputs[0], inputs[1], { ...inputs[2], approverId: 'omar' }], saved)).toBe(false);
  });

  it('never moves a row into or across the locked steps', () => {
    const rows = [...stepRowsFor({ assignees: saved }), { ...stepRowsFor({ assignees: [step('d', 4, 'PENDING')] })[0] }];
    // Row 2 (first unlocked) cannot go up past the locked rows.
    expect(moveRow(rows, 2, -1).map((row) => row.userId)).toEqual(rows.map((row) => row.userId));
    // A locked row cannot move at all.
    expect(moveRow(rows, 1, 1).map((row) => row.userId)).toEqual(rows.map((row) => row.userId));
    // Unlocked rows swap freely.
    expect(moveRow(rows, 3, -1).map((row) => row.userId)).toEqual(['user-a', 'user-b', 'user-d', 'user-c']);
  });
});

describe('isStepEligible — the step flow is internal staff only', () => {
  const member = (roles: string[], status = 'ACTIVE') => ({ status, roles } as Parameters<typeof isStepEligible>[0]);

  it('takes active staff', () => {
    expect(isStepEligible(member(['DESIGNER']))).toBe(true);
    expect(isStepEligible(member(['ART_DIRECTOR']))).toBe(true);
  });

  it('leaves out Client Owners and Client Reviewers', () => {
    expect(isStepEligible(member(['CLIENT_OWNER']))).toBe(false);
    expect(isStepEligible(member(['CLIENT_REVIEWER']))).toBe(false);
  });

  it('keeps somebody who is also staff on the client, and drops anybody not active', () => {
    expect(isStepEligible(member(['CLIENT_REVIEWER', 'COPYWRITER']))).toBe(true);
    expect(isStepEligible(member(['DESIGNER'], 'SUSPENDED'))).toBe(false);
    expect(isStepEligible(member(['DESIGNER'], 'INVITED'))).toBe(false);
  });
});
