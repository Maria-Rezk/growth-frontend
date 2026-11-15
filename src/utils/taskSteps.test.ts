import { describe, expect, it } from 'vitest';
import type { Task, TaskAssignee, TaskStepStatus } from '@/types/domain';
import {
  adminStepActions,
  anchoredCount,
  duplicatePeople,
  flowSteps,
  formStepsFor,
  formatDuration,
  isStepEligible,
  isStepFlow,
  liveStep,
  moveStep,
  myPart,
  newFormPerson,
  newFormStep,
  sameSteps,
  stepActions,
  stepDurationMs,
  stepEditRules,
  stepInputs,
  type FormStep,
} from './taskSteps';

const person = (userId: string, stepOrder: number, status: TaskStepStatus, extra: Partial<TaskAssignee> = {}): TaskAssignee => ({
  id: `row-${userId}-${stepOrder}`,
  userId,
  role: 'DESIGNER',
  stepOrder,
  status,
  approverId: null,
  ...extra,
});

type FlowTask = Pick<Task, 'assignees' | 'steps' | 'status' | 'isDraft'>;
const flow = (assignees: TaskAssignee[], status: Task['status'] = 'IN_PROGRESS'): FlowTask => ({ assignees, status, isDraft: false });

/** Step 1: Jessika + Yasin side by side, approved by Alice. Step 2: Amr alone. */
const shared = (jessika: TaskStepStatus, yasin: TaskStepStatus, amr: TaskStepStatus = 'PENDING') => flow([
  person('jessika', 1, jessika, { role: 'COPYWRITER', approverId: 'alice' }),
  person('yasin', 1, yasin, { approverId: 'alice' }),
  person('amr', 2, amr, { role: 'ART_DIRECTOR' }),
]);

describe('flowSteps — the flow, one entry per step', () => {
  it('groups people who share a stepOrder, in order', () => {
    const steps = flowSteps(shared('SUBMITTED', 'IN_PROGRESS'));
    expect(steps.map((step) => step.assignees.map((row) => row.userId))).toEqual([['jessika', 'yasin'], ['amr']]);
    expect(steps[0]).toMatchObject({ stepOrder: 1, status: 'IN_PROGRESS', approverId: 'alice', assigneeCount: 2, submittedCount: 1 });
    expect(steps[1]).toMatchObject({ status: 'PENDING', approverId: null, submittedCount: 0 });
  });

  it('derives each step status the way the API does', () => {
    expect(flowSteps(shared('TODO', 'TODO'))[0].status).toBe('TODO');
    expect(flowSteps(shared('SUBMITTED', 'TODO'))[0].status).toBe('IN_PROGRESS');
    expect(flowSteps(shared('IN_REVIEW', 'IN_REVIEW'))[0].status).toBe('IN_REVIEW');
    expect(flowSteps(shared('DONE', 'DONE', 'TODO')).map((step) => step.status)).toEqual(['DONE', 'TODO']);
  });

  it('treats each row without stepOrder as its own step (older responses)', () => {
    const rows = [{ ...person('a', 0, 'TODO'), stepOrder: undefined }, { ...person('b', 0, 'PENDING'), stepOrder: undefined }];
    expect(flowSteps({ assignees: rows }).map((step) => step.assignees[0].userId)).toEqual(['a', 'b']);
  });

  it('uses the API’s grouped `steps` when it sends them', () => {
    const task = { assignees: [], steps: [{ stepOrder: 2, status: 'PENDING', approverId: null, assigneeCount: 0, submittedCount: 0, assignees: [] }, { stepOrder: 1, status: 'TODO', approverId: null, assigneeCount: 0, submittedCount: 0, assignees: [] }] } as Pick<Task, 'assignees' | 'steps'>;
    expect(flowSteps(task).map((step) => step.stepOrder)).toEqual([1, 2]);
  });

  it('finds the live step, and a task without people is not a flow', () => {
    expect(liveStep(shared('DONE', 'DONE', 'TODO'))?.stepOrder).toBe(2);
    expect(liveStep(shared('DONE', 'DONE', 'DONE'))).toBeNull();
    expect(isStepFlow({ assignees: [] })).toBe(false);
  });
});

describe('stepActions — based on your own part of the live step', () => {
  it('TODO: Start and Submit; IN_PROGRESS: Submit; SUBMITTED: waiting for teammates', () => {
    const task = shared('SUBMITTED', 'TODO');
    expect(stepActions(task, 'yasin')).toMatchObject({ canStart: true, canSubmit: true, waitingForTeammates: false });
    expect(stepActions(shared('SUBMITTED', 'IN_PROGRESS'), 'yasin')).toMatchObject({ canStart: false, canSubmit: true });
    expect(stepActions(task, 'jessika')).toMatchObject({ canStart: false, canSubmit: false, waitingForTeammates: true });
    expect(myPart(task, 'jessika')?.status).toBe('SUBMITTED');
  });

  it('people on a later step can do nothing yet', () => {
    expect(stepActions(shared('TODO', 'TODO'), 'amr')).toEqual({ canStart: false, canSubmit: false, waitingForTeammates: false, canReview: false });
  });

  it('Approve / Request changes go to the step approver once everybody is in, or to an admin', () => {
    expect(stepActions(shared('SUBMITTED', 'IN_PROGRESS'), 'alice').canReview).toBe(false);
    expect(stepActions(shared('IN_REVIEW', 'IN_REVIEW'), 'alice').canReview).toBe(true);
    expect(stepActions(shared('IN_REVIEW', 'IN_REVIEW'), 'someone').canReview).toBe(false);
    expect(stepActions(shared('IN_REVIEW', 'IN_REVIEW'), 'admin', true).canReview).toBe(true);
  });

  it('a closed task takes no action', () => {
    expect(stepActions(flow(shared('TODO', 'TODO').assignees, 'CANCELED'), 'yasin').canSubmit).toBe(false);
  });

  it('an admin not on the step may press for somebody who can take it', () => {
    expect(adminStepActions(shared('SUBMITTED', 'IN_PROGRESS'))).toEqual({ canStart: false, canSubmit: true });
    expect(adminStepActions(shared('TODO', 'TODO'))).toEqual({ canStart: true, canSubmit: true });
    expect(adminStepActions(shared('IN_REVIEW', 'IN_REVIEW'))).toEqual({ canStart: false, canSubmit: false });
  });
});

describe('durations', () => {
  it('a person’s own work time is submittedAt − startedAt', () => {
    const ms = stepDurationMs({ startedAt: '2026-11-01T09:00:00Z', submittedAt: '2026-11-01T12:10:00Z', completedAt: null });
    expect(formatDuration(ms ?? 0)).toBe('3h 10m');
    expect(stepDurationMs({ startedAt: '2026-11-01T09:00:00Z', submittedAt: null, completedAt: null })).toBeNull();
    expect(formatDuration(52 * 3_600_000)).toBe('2d 4h');
  });
});

describe('the form — steps of people', () => {
  it('locks people who started, and every person on a step with its approver or done', () => {
    const steps = formStepsFor(shared('SUBMITTED', 'TODO'));
    expect(steps[0].people.map((row) => [row.userId, Boolean(row.locked)])).toEqual([['jessika', true], ['yasin', false]]);
    expect(formStepsFor(shared('IN_REVIEW', 'IN_REVIEW'))[0].people.every((row) => row.locked)).toBe(true);
    expect(steps[0].approverId).toBe('alice');
  });

  it('applies the editing rules per step status (guide 1.3)', () => {
    const step = (status?: TaskStepStatus, locked = false): FormStep => ({ key: 's', approverId: '', status, people: [{ key: 'p', userId: 'u', role: 'DESIGNER', locked }] });
    expect(stepEditRules(step('DONE'))).toMatchObject({ anchored: true, canAddPeople: false, canChangeApprover: false });
    expect(stepEditRules(step('IN_REVIEW'))).toMatchObject({ canAddPeople: false, canChangeApprover: true, canClearApprover: false });
    expect(stepEditRules(step('IN_PROGRESS', true))).toMatchObject({ canAddPeople: true, canRemoveStep: false });
    expect(stepEditRules(step('PENDING'))).toMatchObject({ anchored: false, canRemoveStep: true });
    expect(stepEditRules(step(undefined))).toMatchObject({ anchored: false });
  });

  it('keeps started steps first: only the steps after them move', () => {
    const steps = [...formStepsFor(shared('SUBMITTED', 'TODO')), newFormStep([newFormPerson('nadia', 'COPYWRITER')])];
    expect(anchoredCount(steps)).toBe(1);
    // The first step after the started one cannot move above it: unchanged.
    expect(moveStep(steps, 1, -1).map((step) => step.people[0].userId)).toEqual(['jessika', 'amr', 'nadia']);
    expect(moveStep(steps, 2, -1).map((step) => step.people[0].userId)).toEqual(['jessika', 'nadia', 'amr']);
  });

  it('sends stepOrder on everybody once a step has two people, with the step approver on each', () => {
    expect(stepInputs(formStepsFor(shared('TODO', 'TODO')))).toEqual([
      { userId: 'jessika', role: 'COPYWRITER', stepOrder: 1, approverId: 'alice' },
      { userId: 'yasin', role: 'DESIGNER', stepOrder: 1, approverId: 'alice' },
      { userId: 'amr', role: 'ART_DIRECTOR', stepOrder: 2 },
    ]);
  });

  it('sends a one-person-per-step flow the old way, without stepOrder', () => {
    const steps = [newFormStep([newFormPerson('a', 'DESIGNER')]), { ...newFormStep([newFormPerson('b', 'COPYWRITER')]), approverId: 'alice' }];
    expect(stepInputs(steps)).toEqual([{ userId: 'a', role: 'DESIGNER' }, { userId: 'b', role: 'COPYWRITER', approverId: 'alice' }]);
  });

  it('treats a regrouping, a reorder or a new approver as a change', () => {
    const task = shared('TODO', 'TODO');
    const inputs = stepInputs(formStepsFor(task));
    expect(sameSteps(inputs, task)).toBe(true);
    // Yasin moved to a step of his own.
    expect(sameSteps(inputs.map((row) => (row.userId === 'yasin' ? { ...row, stepOrder: 2 } : row.userId === 'amr' ? { ...row, stepOrder: 3 } : row)), task)).toBe(false);
    expect(sameSteps(inputs.map((row) => (row.stepOrder === 1 ? { ...row, approverId: 'omar' } : row)), task)).toBe(false);
  });

  it('flags a person twice on one step, and the same person in the same role anywhere', () => {
    const steps: FormStep[] = [
      { key: 'a', approverId: '', people: [newFormPerson('x', 'DESIGNER'), newFormPerson('x', 'COPYWRITER')] },
      { key: 'b', approverId: '', people: [newFormPerson('y', 'DESIGNER'), newFormPerson('x', 'DESIGNER')] },
    ];
    expect(duplicatePeople(steps)).toEqual([
      { step: 0, person: 1, reason: 'SAME_STEP' },
      { step: 1, person: 1, reason: 'SAME_ROLE' },
    ]);
  });
});

describe('isStepEligible — the flow is internal staff only', () => {
  const member = (roles: string[], status = 'ACTIVE') => ({ status, roles } as Parameters<typeof isStepEligible>[0]);

  it('takes active staff and leaves out client contacts', () => {
    expect(isStepEligible(member(['DESIGNER']))).toBe(true);
    expect(isStepEligible(member(['CLIENT_REVIEWER']))).toBe(false);
    expect(isStepEligible(member(['CLIENT_REVIEWER', 'COPYWRITER']))).toBe(true);
    expect(isStepEligible(member(['DESIGNER'], 'SUSPENDED'))).toBe(false);
  });
});
