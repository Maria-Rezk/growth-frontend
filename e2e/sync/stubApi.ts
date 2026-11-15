import type { BrowserContext, Page, Route } from '@playwright/test';

/*
  A stand-in for the API, for the automatic-sync measurements and checks.

  The demo build never touches the network, so it cannot say how many
  requests a screen sends. This suite runs the real build (VITE_DEMO_MODE off,
  API at /api on the same origin) and answers /api/** here, recording every
  request. It is not a contract test: response shapes are the minimum the
  services read.

  `rateLimit` reproduces the deployed backend's throttle as read from its
  response headers (X-RateLimit-Limit: 100, X-RateLimit-Reset: 60): one
  counter per endpoint and per client address. With `sharedBucket` every
  context counts against one address, which is what happens behind nginx if
  the API does not trust the proxy (release doc F-9). Time is the test's
  virtual clock, set with `setNow`, so it follows page.clock.
*/

export interface LoggedRequest {
  method: string;
  path: string;
  /** Method and path with ids replaced, i.e. which backend handler answers it. */
  endpoint: string;
  session: string;
  at: number;
  status: number;
}

export interface StubOptions {
  companies?: number;
  tasksPerCompany?: number;
  rateLimit?: { limit: number; windowMs: number; sharedBucket: boolean } | null;
}

const USER = { id: 'u1', email: 'sync-qa@example.test', fullName: 'Sync QA', platformRole: 'AGENCY_ADMIN' };
const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
const iso = (days: number) => new Date(Date.UTC(2026, 10, 12 + days, 9)).toISOString();

export function companyId(index: number) {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}
export function taskId(company: number, index: number) {
  return `10000000-0000-4000-8000-${String(company * 1000 + index + 1).padStart(12, '0')}`;
}

/** Ids → `:id`, so /companies/<uuid>/tasks/<uuid> reads as one endpoint. */
export function endpointOf(method: string, path: string): string {
  return `${method} ${path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')}`;
}

function makeTask(company: number, index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: taskId(company, index),
    companyId: companyId(company),
    title: `Task ${company + 1}.${index + 1}`,
    description: 'A task the stub API serves.',
    status: STATUSES[index % STATUSES.length],
    priority: 'MEDIUM',
    taskTypes: ['DESIGN'],
    customTaskType: null,
    isDraft: false,
    assignedToId: USER.id,
    assignedTo: USER,
    assignees: [],
    approverId: index % STATUSES.length === 2 ? USER.id : null,
    approver: index % STATUSES.length === 2 ? USER : null,
    submittedForReviewAt: index % STATUSES.length === 2 ? iso(-1) : null,
    reviewedAt: null,
    reviewNote: null,
    dueDate: iso(3),
    createdAt: iso(-3),
    updatedAt: iso(-1),
    ...overrides,
  };
}

export class StubApi {
  readonly log: LoggedRequest[] = [];
  readonly companies: Array<{ id: string; name: string; status: string }>;
  readonly tasks: Map<string, ReturnType<typeof makeTask>[]> = new Map();
  readonly comments: Map<string, Array<Record<string, unknown>>> = new Map();
  private now = 0;
  private readonly counters = new Map<string, { start: number; count: number }>();
  private readonly options: StubOptions;

  constructor(options: StubOptions = {}) {
    this.options = options;
    const count = options.companies ?? 1;
    this.companies = Array.from({ length: count }, (_, index) => ({ id: companyId(index), name: `Client ${index + 1}`, status: 'ACTIVE' }));
    this.companies.forEach((company, index) => {
      this.tasks.set(company.id, Array.from({ length: options.tasksPerCompany ?? 10 }, (_, t) => makeTask(index, t)));
    });
  }

  setNow(ms: number) { this.now = ms; }

  private readonly holds: Array<{ match: (request: { method: string; endpoint: string }) => boolean; gate: Promise<void>; taken: boolean; reached: () => void }> = [];

  /**
   * Keep the next matching request waiting until `release()` — a poll caught
   * in flight. Its answer is computed when it is released, from the state at
   * the moment it was sent (a snapshot), as a real server's would be.
   */
  holdNext(match: (request: { method: string; endpoint: string }) => boolean) {
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const arrived = new Promise<void>((resolve) => { reached = resolve; });
    this.holds.push({ match, gate, taken: false, reached });
    return { release, arrived };
  }

  /** Another person's change, made on the server without this browser knowing. */
  editTask(company: number, index: number, patch: Record<string, unknown>) {
    const list = this.tasks.get(companyId(company))!;
    const position = list.findIndex((task) => task.id === taskId(company, index));
    list[position] = { ...list[position], ...patch, updatedAt: new Date().toISOString() };
  }

  addTask(company: number, title: string) {
    const list = this.tasks.get(companyId(company))!;
    list.push(makeTask(company, list.length, { title, status: 'TODO' }));
  }

  addComment(company: number, index: number, body: string) {
    const id = taskId(company, index);
    const list = this.comments.get(id) ?? [];
    list.push({ id: `cm-${list.length + 1}`, taskId: id, body, authorId: 'u2', author: { id: 'u2', fullName: 'Someone Else', email: 'else@example.test' }, createdAt: new Date().toISOString() });
    this.comments.set(id, list);
  }

  count(filter: (request: LoggedRequest) => boolean = () => true) {
    return this.log.filter(filter).length;
  }

  byEndpoint(filter: (request: LoggedRequest) => boolean = () => true) {
    const totals: Record<string, number> = {};
    this.log.filter(filter).forEach((request) => { totals[request.endpoint] = (totals[request.endpoint] ?? 0) + 1; });
    return Object.fromEntries(Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)));
  }

  async attach(target: Page | BrowserContext, session = 'A') {
    await target.route('**/api/**', (route) => this.handle(route, session));
  }

  private limited(endpoint: string, session: string): boolean {
    const rule = this.options.rateLimit;
    if (!rule) return false;
    const key = `${endpoint}|${rule.sharedBucket ? 'proxy' : session}`;
    const bucket = this.counters.get(key);
    if (!bucket || this.now - bucket.start >= rule.windowMs) {
      this.counters.set(key, { start: this.now, count: 1 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > rule.limit;
  }

  private async handle(route: Route, session: string) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const endpoint = endpointOf(method, path);

    if (this.limited(endpoint, session)) {
      this.log.push({ method, path, endpoint, session, at: this.now, status: 429 });
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }) });
      return;
    }

    const hold = this.holds.find((candidate) => !candidate.taken && candidate.match({ method, endpoint }));
    if (hold) {
      hold.taken = true;
      const snapshot = JSON.stringify(this.answer(method, path, url.searchParams));
      hold.reached();
      await hold.gate;
      this.log.push({ method, path, endpoint, session, at: this.now, status: 200 });
      await route.fulfill({ status: 200, contentType: 'application/json', body: snapshot });
      return;
    }

    const body = this.answer(method, path, url.searchParams, request.postDataJSON?.() ?? null);
    this.log.push({ method, path, endpoint, session, at: this.now, status: body === undefined ? 404 : 200 });
    if (body === undefined) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ statusCode: 404, message: `Cannot ${method} /api${path}` }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }

  private answer(method: string, path: string, params: URLSearchParams, payload: Record<string, unknown> | null = null): unknown {
    if (method !== 'GET') {
      if (path === '/auth/refresh') return { accessToken: 'stub-token', user: USER };
      if (path === '/auth/logout') return { success: true };
      const status = path.match(/^\/companies\/([^/]+)\/tasks\/([^/]+)\/status$/);
      if (status && method === 'PATCH') {
        const list = this.tasks.get(status[1]) ?? [];
        const index = list.findIndex((task) => task.id === status[2]);
        list[index] = { ...list[index], status: String(payload?.status), updatedAt: new Date().toISOString() };
        return list[index];
      }
      const comment = path.match(/^\/companies\/([^/]+)\/tasks\/([^/]+)\/comments$/);
      if (comment && method === 'POST') {
        const list = this.comments.get(comment[2]) ?? [];
        const created = { id: `cm-${list.length + 1}`, taskId: comment[2], body: String(payload?.body ?? payload?.comment ?? ''), authorId: USER.id, author: USER, createdAt: new Date().toISOString() };
        list.push(created);
        this.comments.set(comment[2], list);
        return created;
      }
      return {};
    }
    if (path === '/auth/me') return { user: USER };
    if (path === '/me/memberships') {
      return this.companies.map((company, index) => ({ id: `m-${index}`, companyId: company.id, roles: ['ACCOUNT_MANAGER'], status: 'ACTIVE', company }));
    }
    if (path === '/companies') return this.companies;
    if (path === '/notifications') return [];
    if (path === '/notifications/unread-count') return { count: 0 };
    if (path === '/me/notification-preferences') return { mutedTypes: [], emailDigest: true };
    if (path === '/me/approval-queue') {
      const items = [...this.tasks.values()].flat().filter((task) => task.status === 'IN_REVIEW' && task.approverId === USER.id)
        .map((task) => ({ ...task, company: this.companies.find((company) => company.id === task.companyId) }));
      const limit = Number(params.get('limit') ?? 25);
      return { items: items.slice(0, limit), total: items.length, limit, offset: 0 };
    }

    const match = path.match(/^\/companies\/([^/]+)(\/.*)?$/);
    if (!match) return [];
    const [, company, rest = ''] = match;
    const tasks = this.tasks.get(company) ?? [];

    if (rest === '/tasks' || rest === '/tasks/my') {
      const status = params.get('status');
      return status ? tasks.filter((task) => task.status === status) : tasks;
    }
    if (rest === '/tasks/approval-queue') {
      const items = tasks.filter((task) => task.status === 'IN_REVIEW');
      return { items, total: items.length, limit: 50, offset: 0 };
    }
    const taskMatch = rest.match(/^\/tasks\/([^/]+)(\/.*)?$/);
    if (taskMatch) {
      const [, id, sub = ''] = taskMatch;
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task) return undefined;
      if (sub === '') return task;
      if (sub === '/comments') return this.comments.get(id) ?? [];
      if (sub === '/activity-logs') return [];
      if (sub === '/attachments') return [];
      return [];
    }
    if (rest === '/leads') {
      const limit = Number(params.get('limit') ?? 25);
      return { items: [], total: 0, limit, offset: Number(params.get('offset') ?? 0) };
    }
    if (rest === '/members' || rest === '/staff' || rest.startsWith('/responsibilit')) return [];
    return [];
  }
}
