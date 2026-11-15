import { describe, expect, it } from 'vitest';
import type { AppNotification } from '@/types/domain';
import { notificationContext } from './notificationMeta';

const base: AppNotification = { id: 'n1', type: 'TASK_ASSIGNED', readAt: null };

describe('notificationContext (parallel-steps guide 2)', () => {
  it('names who acted, the task as it is now, and everybody on the live step still working', () => {
    const context = notificationContext({
      ...base,
      actionBy: { id: 'amr', fullName: 'Amr Art' },
      createdBy: { id: 'amr', fullName: 'Amr Art' },
      task: { id: 't1', title: 'Launch reel', status: 'IN_PROGRESS' },
      currentAssignees: [
        { id: 'jessika', fullName: 'Jessika AM', status: 'SUBMITTED' },
        { id: 'yasin', fullName: 'Yasin Designer', status: 'IN_PROGRESS' },
      ],
    });
    expect(context).toEqual({
      task: { title: 'Launch reel', status: 'IN_PROGRESS' },
      actor: 'Amr Art',
      // Jessika has handed in: the task is with Yasin.
      withNames: ['Yasin Designer'],
      // Same person as the actor: not said twice.
      createdBy: undefined,
    });
  });

  it('names nobody while the step is with its approver', () => {
    expect(notificationContext({
      ...base,
      task: { id: 't', title: 'T', status: 'IN_REVIEW' },
      currentAssignees: [{ id: 'y', fullName: 'Yasin', status: 'IN_REVIEW' }],
    }).withNames).toEqual([]);
  });

  it('falls back to the assignee, and says nobody has it once the task is closed', () => {
    expect(notificationContext({ ...base, assignedTo: { id: 'y', fullName: 'Yasin' }, task: { id: 't', title: 'T', status: 'TODO' } }).withNames).toEqual(['Yasin']);
    expect(notificationContext({ ...base, assignedTo: { id: 'y', fullName: 'Yasin' }, task: { id: 't', title: 'T', status: 'DONE' } }).withNames).toEqual([]);
  });

  it('says nothing it does not know: reminders and older notifications have no actor', () => {
    expect(notificationContext({ ...base, actionBy: null, createdBy: { id: 'c', fullName: 'Cara' } })).toEqual({ task: undefined, actor: undefined, withNames: [], createdBy: 'Cara' });
  });
});
