import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_DASHBOARD_KEY, MY_MEMBERSHIPS_KEY, MY_WORK_KEY, queryClient, queryKeys } from './queryClient';
import {
  RATE_LIMIT_COOLDOWN_MS,
  RATE_LIMITED_MS,
  baseIntervalFor,
  myWorkIntervalMs,
  noteQueryError,
  resetSyncState,
  syncRefetchInterval,
  syncTierFor,
} from './syncPolicy';

const C = 'company-1';
const T = 'task-1';

afterEach(() => resetSyncState());

/** A query as React Query hands it to `refetchInterval`. */
function query(queryKey: readonly unknown[], state: { status?: 'success' | 'error' | 'pending'; error?: unknown } = {}) {
  return { queryKey, state: { status: state.status ?? 'success', error: state.error ?? null } } as unknown as Parameters<typeof syncRefetchInterval>[0];
}

describe('keys that sync (phase 1)', () => {
  const cases: Array<[string, readonly unknown[], string, number]> = [
    // Tasks › Board and Table, as TasksPage builds them, and the alert tiles.
    ['task list, all', [...queryKeys.tasks(C, { status: undefined }), 'all'], 'tasks-list', 60_000],
    ['task list, mine', [...queryKeys.tasks(C, { status: 'TODO' }), 'mine'], 'tasks-list', 60_000],
    ['task alert tiles', [...queryKeys.tasks(C, { scope: 'all' }), 'alerts'], 'tasks-list', 60_000],
    ['bare task list', queryKeys.tasks(C), 'tasks-list', 60_000],
    // Task detail.
    ['task', queryKeys.task(C, T), 'task-detail', 30_000],
    ['task comments', queryKeys.taskComments(C, T), 'task-detail', 30_000],
    ['task activity', queryKeys.taskLogs(C, T), 'task-detail', 30_000],
    ['task attachments', queryKeys.attachments(C, 'TASK', T), 'task-detail', 30_000],
    // Approval queues.
    ['approval queue page', queryKeys.meApprovalQueue({ limit: 25 }), 'approval-queue', 30_000],
    ['per-client approval queue', queryKeys.approvalQueue(C, { limit: 50 }), 'approval-queue', 30_000],
    // Leads.
    ['lead list', queryKeys.leads(C, { limit: 25, offset: 0 }), 'leads', 60_000],
    ['lead follow-up tiles', [...queryKeys.leads(C, { scope: 'all' }), 'follow-up'], 'leads', 60_000],
    ['lead pipeline counts', queryKeys.leadCounts(C, {}), 'lead-counts', 300_000],
    // My work, interval by client count.
    ['my work, 1 client', queryKeys.myWork(['a']), 'my-work', 60_000],
    ['my work, 4 clients', queryKeys.myWork(['a', 'b', 'c', 'd']), 'my-work', 120_000],
  ];

  it.each(cases)('%s', (_label, key, tier, interval) => {
    expect(syncTierFor(key)).toBe(tier);
    expect(baseIntervalFor(key)).toBe(interval);
    expect(syncRefetchInterval(query(key))).toBe(interval);
  });
});

describe('keys that must not sync', () => {
  /*
    Every other key the app builds. A new key added to queryKeys does not
    poll unless a shape in syncPolicy.ts is written for it; this list is what
    catches a shape written too loosely.
  */
  const notSynced: Array<[string, readonly unknown[]]> = [
    ['notifications', queryKeys.notifications],
    ['unread count', queryKeys.unreadNotifications],
    ['notifications incl. muted', queryKeys.notificationsIncludingMuted],
    ['notification preferences', queryKeys.notificationPreferences('u1')],
    ['my memberships', queryKeys.myMemberships('u1')],
    ['memberships prefix', MY_MEMBERSHIPS_KEY],
    ['companies', queryKeys.companies],
    ['employees', queryKeys.employees],
    ['company members', queryKeys.companyMembers(C)],
    ['company staff', queryKeys.companyStaff(C)],
    ['brand profile', queryKeys.brandProfile(C)],
    ['posts', queryKeys.posts(C, {})],
    ['post', queryKeys.post(C, 'p1')],
    ['post comments', queryKeys.postComments(C, 'p1')],
    ['post logs', queryKeys.postLogs(C, 'p1')],
    ['post assets', queryKeys.postAssets(C, 'p1')],
    ['lead', queryKeys.lead(C, 'l1')],
    ['lead notes', queryKeys.leadNotes(C, 'l1')],
    ['lead history', queryKeys.leadHistory(C, 'l1')],
    ['task drafts', queryKeys.taskDrafts(C)],
    ['resolve approver', queryKeys.resolveApprover(C, 'DESIGN')],
    ['responsibility area options', queryKeys.responsibilityAreaOptions(C)],
    ['responsibility matrix', queryKeys.responsibilityMatrix(C)],
    ['responsibility areas', queryKeys.responsibilityAreas(C)],
    ['reports', queryKeys.reports(C)],
    ['report', queryKeys.report(C, 'r1')],
    ['report share', queryKeys.reportShare(C, 'r1')],
    ['report overview', queryKeys.reportOverview(C, {})],
    ['post attachments', queryKeys.attachments(C, 'POST', 'p1')],
    ['lead attachments', queryKeys.attachments(C, 'LEAD', 'l1')],
    ['brand attachments', queryKeys.attachments(C, 'BRAND_PROFILE')],
    ['content plans', queryKeys.contentPlans(C)],
    ['content plan', queryKeys.contentPlan(C, 'cp1')],
    ['automation rules', queryKeys.automationRules(C)],
    ['automation runs', queryKeys.automationRuns(C, {})],
    ['ai generations', queryKeys.aiGenerations(C)],
    ['invitations', queryKeys.invitations(C)],
    ['campaigns', queryKeys.campaigns(C, {})],
    ['campaign', queryKeys.campaign(C, 'c1')],
    ['admin widget', queryKeys.adminWidget('overview', {} as never)],
    ['admin dashboard prefix', ADMIN_DASHBOARD_KEY],
    ['system health', queryKeys.adminSystemHealth],
    ['my-work prefix', MY_WORK_KEY],
    // Near misses: the shapes must match exactly, not by prefix.
    ['tasks prefix', ['companies', C, 'tasks']],
    ['leads prefix', ['companies', C, 'leads']],
    ['task under a deeper path', [...queryKeys.task(C, T), 'something-else']],
    ['task list with an unknown suffix', [...queryKeys.tasks(C, {}), 'all', 'extra']],
    ['approval queue without params', ['companies', C, 'tasks', 'approval-queue']],
    ['empty company id', ['companies', '', 'tasks', {}]],
    ['an unrelated root', ['tasks', C]],
  ];

  it.each(notSynced)('%s', (_label, key) => {
    expect(syncTierFor(key)).toBeNull();
    expect(syncRefetchInterval(query(key))).toBe(false);
  });
});

describe('My work interval', () => {
  it('scales with the number of clients, one request each, within 1–5 minutes', () => {
    expect(myWorkIntervalMs(0)).toBe(60_000);
    expect(myWorkIntervalMs(2)).toBe(60_000);
    expect(myWorkIntervalMs(3)).toBe(90_000);
    expect(myWorkIntervalMs(10)).toBe(300_000);
    expect(myWorkIntervalMs(40)).toBe(300_000);
  });

  it('keeps one open My work page at no more than two requests a minute until the cap', () => {
    for (let clients = 1; clients <= 10; clients += 1) {
      const perMinute = clients * (60_000 / myWorkIntervalMs(clients));
      expect(perMinute).toBeLessThanOrEqual(2);
    }
  });
});

describe('backoff', () => {
  const list = queryKeys.tasks(C, {});

  it('waits four times longer after a failed refresh, capped at five minutes', () => {
    expect(syncRefetchInterval(query(list, { status: 'error', error: { statusCode: 503 } }))).toBe(240_000);
    expect(syncRefetchInterval(query(queryKeys.task(C, T), { status: 'error', error: { statusCode: 500 } }))).toBe(120_000);
    expect(syncRefetchInterval(query(queryKeys.leadCounts(C, {}), { status: 'error', error: {} }))).toBe(RATE_LIMITED_MS);
  });

  it('waits five minutes after a 429 on that query', () => {
    expect(syncRefetchInterval(query(list, { status: 'error', error: { statusCode: 429 } }))).toBe(RATE_LIMITED_MS);
  });

  it('holds every synced query off for a full window after a 429 anywhere', () => {
    const now = 1_000_000;
    noteQueryError({ statusCode: 429 }, now);
    expect(syncRefetchInterval(query(queryKeys.task(C, T)), now)).toBe(RATE_LIMIT_COOLDOWN_MS);
    expect(syncRefetchInterval(query(queryKeys.task(C, T)), now + 50_000)).toBe(30_000);
    expect(syncRefetchInterval(query(queryKeys.task(C, T)), now + RATE_LIMIT_COOLDOWN_MS + 1)).toBe(30_000);
    // Still nothing for keys that do not sync.
    expect(syncRefetchInterval(query(queryKeys.notifications), now)).toBe(false);
  });

  it('ignores other errors for the cooldown', () => {
    noteQueryError({ statusCode: 500 }, 0);
    expect(syncRefetchInterval(query(queryKeys.task(C, T)), 1)).toBe(30_000);
  });
});

describe('the app QueryClient', () => {
  it('uses the policy as every query\'s default interval and keeps the other defaults', () => {
    const defaults = queryClient.getDefaultOptions().queries!;
    expect(defaults.refetchOnWindowFocus).toBe(true);
    expect(defaults.refetchOnReconnect).toBe(true);
    expect(defaults.refetchIntervalInBackground).toBeUndefined();
    const interval = defaults.refetchInterval as (q: unknown) => number | false;
    expect(interval(query(queryKeys.task(C, T)))).toBe(30_000);
    expect(interval(query(queryKeys.unreadNotifications))).toBe(false);
  });
});
