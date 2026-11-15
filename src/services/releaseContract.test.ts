import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Request shapes from the release integration guide (9 November 2026). Only
  `http` is stubbed; the real payload construction runs.
*/
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return { ...actual, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});
vi.mock('@/lib/paging', () => ({ getAllItems: vi.fn(async () => []) }));

const { http } = await import('@/lib/http');
const { getAllItems } = await import('@/lib/paging');
const { tasksService } = await import('@/services/tasks');
const { usersService } = await import('@/services/users');

const post = http.post as ReturnType<typeof vi.fn>;
const patch = http.patch as ReturnType<typeof vi.fn>;
const get = http.get as ReturnType<typeof vi.fn>;
const allItems = getAllItems as ReturnType<typeof vi.fn>;

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: { id: 't1', assignees: [] } });
  patch.mockReset().mockResolvedValue({ data: { id: 't1', assignees: [] } });
  get.mockReset();
  allItems.mockClear();
});

describe('POST /tasks with people — the step flow (3.5)', () => {
  it('sends the steps in order with their approvers, and no task-level assignee or approver', async () => {
    await tasksService.create('c1', {
      title: 'Launch carousel',
      assignees: [
        { userId: 'jessika', role: 'ACCOUNT_MANAGER', approverId: 'alice' },
        { userId: 'yasin', role: 'DESIGNER', approverId: 'omar' },
        { userId: 'amr', role: 'ART_DIRECTOR' },
      ],
      assignedToId: 'jessika',
      approverId: 'alice',
    });
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.assignees).toEqual([
      { userId: 'jessika', role: 'ACCOUNT_MANAGER', approverId: 'alice' },
      { userId: 'yasin', role: 'DESIGNER', approverId: 'omar' },
      { userId: 'amr', role: 'ART_DIRECTOR' },
    ]);
    // `assignedToId` on a flow is a 400; approvers travel per step.
    expect(body).not.toHaveProperty('assignedToId');
    expect(body).not.toHaveProperty('approverId');
  });

  it('a task without people keeps one assignee and one approver', async () => {
    await tasksService.create('c1', { title: 'Solo', assignees: [], assignedToId: 'u1', approverId: 'u2' });
    const body = JSON.parse(JSON.stringify(post.mock.calls[0][1])) as Record<string, unknown>;
    expect(body).toMatchObject({ assignedToId: 'u1', approverId: 'u2' });
    expect(body).not.toHaveProperty('assignees');
  });
});

describe('PATCH /tasks/:id — changing the flow', () => {
  it('sends the whole list with step approvers', async () => {
    await tasksService.update('c1', 't1', { assignees: [{ userId: 'a', role: 'DESIGNER', approverId: 'b' }, { userId: 'c', role: 'COPYWRITER' }] });
    expect((patch.mock.calls[0][1] as Record<string, unknown>).assignees).toEqual([
      { userId: 'a', role: 'DESIGNER', approverId: 'b' },
      { userId: 'c', role: 'COPYWRITER' },
    ]);
  });
});

describe('PATCH /tasks/:id { approverId } — re-routing the live step (3.5)', () => {
  it('sends only the approver: no steps, no assignee', async () => {
    await tasksService.update('c1', 't1', { approverId: 'omar' });
    expect(patch.mock.calls[0][1]).toEqual({ approverId: 'omar' });
  });
});

describe('task responses — steps', () => {
  it('sorts steps by stepOrder whatever order they arrive in', async () => {
    get.mockResolvedValue({ data: { id: 't1', assignees: [
      { id: 's2', stepOrder: 2, status: 'PENDING', userId: 'b', role: 'DESIGNER' },
      { id: 's1', stepOrder: 1, status: 'TODO', userId: 'a', role: 'ACCOUNT_MANAGER' },
    ] } });
    const task = await tasksService.get('c1', 't1');
    expect(task.assignees.map((step) => step.id)).toEqual(['s1', 's2']);
  });
});

describe('GET /users?type=', () => {
  it('asks for staff only by default — the Employees page never lists client contacts', async () => {
    await usersService.list();
    expect(allItems).toHaveBeenCalledWith('/users', { type: 'employees' });
  });

  it('can still ask for everybody, or for client contacts', async () => {
    await usersService.list('all');
    expect(allItems).toHaveBeenLastCalledWith('/users', undefined);
    await usersService.list('clients');
    expect(allItems).toHaveBeenLastCalledWith('/users', { type: 'clients' });
  });
});
