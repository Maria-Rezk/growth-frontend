import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Request and response shapes from the parallel-steps guide (11 November
  2026). Only `http` is stubbed; the real payload construction runs.
*/
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return { ...actual, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

const { http } = await import('@/lib/http');
const { tasksService } = await import('@/services/tasks');
const { notificationsService } = await import('@/services/notifications');

const post = http.post as ReturnType<typeof vi.fn>;
const patch = http.patch as ReturnType<typeof vi.fn>;
const get = http.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: { id: 't1', assignees: [] } });
  patch.mockReset().mockResolvedValue({ data: { id: 't1', assignees: [] } });
  get.mockReset();
});

describe('POST /tasks — people side by side on a step (1.2)', () => {
  it('sends stepOrder on everybody, and one approver per step', async () => {
    await tasksService.create('c1', {
      title: 'Launch reel',
      assignees: [
        { userId: 'jessika', role: 'COPYWRITER', stepOrder: 1, approverId: 'alice' },
        { userId: 'yasin', role: 'DESIGNER', stepOrder: 1, approverId: 'alice' },
        { userId: 'amr', role: 'ART_DIRECTOR', stepOrder: 2 },
      ],
    });
    expect((post.mock.calls[0][1] as { assignees: unknown }).assignees).toEqual([
      { userId: 'jessika', role: 'COPYWRITER', stepOrder: 1, approverId: 'alice' },
      { userId: 'yasin', role: 'DESIGNER', stepOrder: 1, approverId: 'alice' },
      { userId: 'amr', role: 'ART_DIRECTOR', stepOrder: 2 },
    ]);
  });
});

describe('the four step actions (1.5)', () => {
  it('Start sends onBehalfOfUserId only when an admin acts for somebody', async () => {
    await tasksService.setStatus('c1', 't1', 'IN_PROGRESS');
    expect(patch.mock.calls[0][1]).toEqual({ status: 'IN_PROGRESS', note: undefined });
    await tasksService.setStatus('c1', 't1', 'IN_PROGRESS', undefined, 'yasin');
    expect(patch.mock.calls[1][1]).toEqual({ status: 'IN_PROGRESS', note: undefined, onBehalfOfUserId: 'yasin' });
  });

  it('Hand in sends no body, or only onBehalfOfUserId', async () => {
    await tasksService.submitForReview('c1', 't1');
    expect(post.mock.calls[0][1]).toBeUndefined();
    await tasksService.submitForReview('c1', 't1', 'yasin');
    expect(post.mock.calls[1][1]).toEqual({ onBehalfOfUserId: 'yasin' });
  });

  it('Request changes sends userIds only when some, not all, go back', async () => {
    await tasksService.requestChanges('c1', 't1', ' Redo the cover ');
    expect(post.mock.calls[0][1]).toEqual({ note: 'Redo the cover' });
    await tasksService.requestChanges('c1', 't1', 'Redo the cover', ['yasin']);
    expect(post.mock.calls[1][1]).toEqual({ note: 'Redo the cover', userIds: ['yasin'] });
  });
});

describe('responses', () => {
  it('keeps the grouped steps the API sends', async () => {
    get.mockResolvedValue({ data: { id: 't1', assignees: [], steps: [{ stepOrder: 1, status: 'IN_PROGRESS', approverId: 'alice', assigneeCount: 2, submittedCount: 1, assignees: [] }] } });
    const task = await tasksService.get('c1', 't1');
    expect(task.steps?.[0]).toMatchObject({ stepOrder: 1, submittedCount: 1, assigneeCount: 2 });
  });

  it('reads the notification people fields, and defaults them for an older API (2)', async () => {
    get.mockResolvedValue({ data: [
      { id: 'n1', type: 'TASK_ASSIGNED', entityType: 'TASK', entityId: 't1', actionBy: { id: 'amr', fullName: 'Amr Art' }, currentAssignees: [{ id: 'y', fullName: 'Yasin', status: 'TODO' }], task: { id: 't1', title: 'Launch reel', status: 'IN_PROGRESS' } },
      { id: 'n2', type: 'LEAD_STATUS_CHANGED' },
    ] });
    const [withPeople, older] = await notificationsService.list();
    expect(withPeople).toMatchObject({ actionBy: { fullName: 'Amr Art' }, task: { title: 'Launch reel', status: 'IN_PROGRESS' }, relatedEntityId: 't1' });
    expect(older).toMatchObject({ actionBy: null, createdBy: null, assignedTo: null, currentAssignees: [], task: null });
  });
});
