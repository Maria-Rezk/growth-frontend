import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Request shapes pinned to the backend source (manaf88/CRM-PLATFORM, branch
  task-draft). The API's global ValidationPipe runs with
  `whitelist + forbidNonWhitelisted`, so any property a DTO does not declare —
  in a body or in a query string bound to a DTO — is a 400. Only `http` is
  stubbed; the real payload construction runs.
*/
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return { ...actual, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

const { http } = await import('@/lib/http');
const { contentService, postQuery } = await import('@/services/content');
const { automationsService } = await import('@/services/automations');
const { postAssetsService } = await import('@/services/postAssets');
const { tasksService, typeFields } = await import('@/services/tasks');

const get = http.get as ReturnType<typeof vi.fn>;
const post = http.post as ReturnType<typeof vi.fn>;
const patch = http.patch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: [] });
  post.mockReset().mockResolvedValue({ data: {} });
  patch.mockReset().mockResolvedValue({ data: {} });
});

describe('GET /posts — FindContentPostsQueryDto: contentPlanId, status, platform, contentType', () => {
  it('sends only the declared filters: no limit, offset or search', async () => {
    await contentService.listPosts('c1', { status: 'DRAFT', search: 'launch' });
    const config = get.mock.calls[0][1] as { params?: Record<string, unknown> };
    expect(config.params).toEqual({ status: 'DRAFT' });
  });

  it('sends no query at all when there is nothing to filter', async () => {
    await contentService.listPosts('c1');
    expect((get.mock.calls[0][1] as { params?: unknown }).params).toBeUndefined();
  });

  it('applies search to the response instead of the server', async () => {
    get.mockResolvedValue({ data: [
      { id: 'p1', title: 'Launch reel', caption: '' },
      { id: 'p2', title: 'Monthly recap', caption: 'launch numbers' },
      { id: 'p3', title: 'Hiring post', caption: '' },
    ] });
    const rows = await contentService.listPosts('c1', { search: 'LAUNCH' });
    expect(rows.map((row) => row.id)).toEqual(['p1', 'p2']);
  });

  it('drops empty and undeclared keys', () => {
    expect(postQuery({ status: '', priority: 'HIGH', contentPlanId: 'x' } as never)).toEqual({ contentPlanId: 'x' });
  });
});

describe('GET /automation-runs — FindAutomationRunsQueryDto has no ruleId', () => {
  it('never sends ruleId, and filters by rule locally', async () => {
    get.mockResolvedValue({ data: [
      { id: 'r1', ruleId: 'a', status: 'SUCCESS' },
      { id: 'r2', ruleId: 'b', status: 'SUCCESS' },
    ] });
    const runs = await automationsService.listRuns('c1', { status: 'SUCCESS', ruleId: 'b' });
    expect((get.mock.calls[0][1] as { params?: Record<string, unknown> }).params).toEqual({ status: 'SUCCESS' });
    expect(runs.map((run) => run.id)).toEqual(['r2']);
  });
});

describe('POST /posts/:id/assets — AttachPostAssetDto: fileId, assetType', () => {
  it('sends exactly fileId and assetType', async () => {
    post.mockResolvedValue({ data: { id: 'a1', assetType: 'DESIGN', file: { id: 'f1' } } });
    await postAssetsService.add('c1', 'p1', 'f1', 'DESIGN');
    expect(post.mock.calls[0][1]).toEqual({ fileId: 'f1', assetType: 'DESIGN' });
  });
});

describe('tasks — taskTypes is optional but @ArrayMinSize(1)', () => {
  it('leaves an empty selection out rather than sending []', () => {
    expect(typeFields([], null)).toEqual({});
    expect(typeFields(undefined, 'x')).toEqual({});
  });

  it('sends the custom text only with OTHER', () => {
    expect(typeFields(['DESIGN'], 'leftover')).toEqual({ taskTypes: ['DESIGN'], customTaskType: undefined });
    expect(typeFields(['OTHER'], ' Event setup ')).toEqual({ taskTypes: ['OTHER'], customTaskType: 'Event setup' });
  });

  it('a draft with no type is created without a taskTypes field', async () => {
    post.mockResolvedValue({ data: { id: 't1', title: 'Draft', taskTypes: [] } });
    await tasksService.create('c1', { title: 'Half-written brief', taskTypes: [], isDraft: true });
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('taskTypes');
    expect(body.isDraft).toBe(true);
  });

  it('the list filter is sent as taskType, not type', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } });
    await tasksService.list('c1', { type: 'DESIGN' });
    const config = get.mock.calls[0][1] as { params: Record<string, unknown> };
    expect(config.params.taskType).toBe('DESIGN');
    expect(config.params).not.toHaveProperty('type');
  });
});
