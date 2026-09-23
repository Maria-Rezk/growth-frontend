import { QueryClient } from '@tanstack/react-query';
import type { ApiErrorShape, DashboardFilters } from '@/types/domain';

function shouldRetry(failureCount: number, error: unknown) {
  const statusCode = (error as ApiErrorShape | undefined)?.statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 10 * 60_000,
      /*
        Both on. This was the main reason data needed a manual refresh: a
        stale query only re-fetches on its own after `staleTime`, on remount,
        or on one of these two triggers — with both off, switching back to a
        tab (or a laptop waking up and reconnecting) never updated anything
        someone else had changed in the meantime. React Query already
        de-dupes and only re-fetches queries currently in use, so this does
        not turn into background polling.
      */
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: shouldRetry,
    },
    mutations: {
      // Not retried automatically: a failed POST/PATCH must not silently
      // resubmit — the caller decides whether to retry, same as before.
      retry: false,
    },
  },
});

/** Prefix that invalidates every cross-client "my work" query at once. */
export const MY_WORK_KEY = ['my-work'] as const;

/**
 * Prefix covering every admin dashboard widget.
 *
 * The widgets are independent requests but they read one dataset, so an admin
 * action (add/rename/archive/delete a client, change a role) invalidates the
 * whole prefix rather than trying to name the handful of cards it touched.
 */
export const ADMIN_DASHBOARD_KEY = ['admin', 'dashboard'] as const;

export const queryKeys = {
  companies: ['companies'] as const,
  employees: ['employees'] as const,
  companyMembers: (companyId: string) => ['companies', companyId, 'members'] as const,
  brandProfile: (companyId: string) => ['companies', companyId, 'brand-profile'] as const,
  posts: (companyId: string, filters?: Record<string, unknown>) => ['companies', companyId, 'posts', filters ?? {}] as const,
  post: (companyId: string, postId: string) => ['companies', companyId, 'posts', postId] as const,
  leads: (companyId: string, filters?: Record<string, unknown>) => ['companies', companyId, 'leads', filters ?? {}] as const,
  // Nested under 'leads' on purpose: invalidating ['companies', id, 'leads']
  // after a status change refreshes the list AND the pipeline counts.
  leadCounts: (companyId: string, filters?: Record<string, unknown>) => ['companies', companyId, 'leads', 'counts', filters ?? {}] as const,
  lead: (companyId: string, leadId: string) => ['companies', companyId, 'leads', leadId] as const,
  tasks: (companyId: string, filters?: Record<string, unknown>) => ['companies', companyId, 'tasks', filters ?? {}] as const,
  /*
    "My work" spans clients, so it cannot live under ['companies', id, …] and
    is not reached by the prefix invalidations every task mutation fires.
    Anything that changes a task must invalidate MY_WORK_KEY as well.
  */
  myWork: (companyIds: readonly string[], filters?: Record<string, unknown>) =>
    ['my-work', [...companyIds].sort().join('|'), filters ?? {}] as const,
  task: (companyId: string, taskId: string) => ['companies', companyId, 'tasks', taskId] as const,
  /** Cross-client reviews waiting on me. Under MY_WORK_KEY so every task mutation refreshes it. */
  myReviews: (companyIds: readonly string[]) => ['my-work', 'reviews', [...companyIds].sort().join('|')] as const,
  /*
    Nested under 'tasks' on purpose: every task mutation already invalidates
    ['companies', id, 'tasks'], and a verdict must drop the task out of the
    queue without each screen remembering to say so.
  */
  approvalQueue: (companyId: string, params?: Record<string, unknown>) =>
    ['companies', companyId, 'tasks', 'approval-queue', params ?? {}] as const,
  // Under 'responsibilities' so a matrix edit re-reads who approves what.
  resolveApprover: (companyId: string, taskType: string) =>
    ['companies', companyId, 'responsibilities', 'resolve-approver', taskType] as const,
  reports: (companyId: string) => ['companies', companyId, 'reports'] as const,
  contentPlans: (companyId: string) => ['companies', companyId, 'content-plans'] as const,
  aiGenerations: (companyId: string) => ['companies', companyId, 'ai-generations'] as const,
  reportOverview: (companyId: string, period?: Record<string, unknown>) => ['companies', companyId, 'reports', 'overview', period ?? {}] as const,
  invitations: (companyId: string) => ['companies', companyId, 'invitations'] as const,
  campaigns: (companyId: string, filters?: unknown) => ['companies', companyId, 'campaigns', filters ?? {}] as const,
  campaign: (companyId: string, campaignId: string) => ['companies', companyId, 'campaigns', campaignId] as const,
  /**
   * One key per admin widget. `filters` is part of the key, so changing the
   * shared filter bar refetches instead of showing another range's numbers.
   */
  adminWidget: (widget: string, filters?: DashboardFilters) =>
    ['admin', 'dashboard', widget, filters ?? {}] as const,
  adminSystemHealth: ['admin', 'system', 'health'] as const,
  notifications: ['notifications'] as const,
  unreadNotifications: ['notifications', 'unread-count'] as const,
  responsibilityMatrix: (companyId: string) => ['companies', companyId, 'responsibilities', 'matrix'] as const,
  responsibilityAreas: (companyId: string) => ['companies', companyId, 'responsibilities', 'areas'] as const,
};
