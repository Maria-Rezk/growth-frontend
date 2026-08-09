import { QueryClient } from '@tanstack/react-query';
import type { ApiErrorShape } from '@/types/domain';

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
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
    mutations: {
      retry: false,
    },
  },
});

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
  task: (companyId: string, taskId: string) => ['companies', companyId, 'tasks', taskId] as const,
  reports: (companyId: string) => ['companies', companyId, 'reports'] as const,
  contentPlans: (companyId: string) => ['companies', companyId, 'content-plans'] as const,
  aiGenerations: (companyId: string) => ['companies', companyId, 'ai-generations'] as const,
  reportOverview: (companyId: string, period?: Record<string, unknown>) => ['companies', companyId, 'reports', 'overview', period ?? {}] as const,
  invitations: (companyId: string) => ['companies', companyId, 'invitations'] as const,
  campaigns: (companyId: string, filters?: unknown) => ['companies', companyId, 'campaigns', filters ?? {}] as const,
  campaign: (companyId: string, campaignId: string) => ['companies', companyId, 'campaigns', campaignId] as const,
  notifications: ['notifications'] as const,
  unreadNotifications: ['notifications', 'unread-count'] as const,
  responsibilityMatrix: (companyId: string) => ['companies', companyId, 'responsibilities', 'matrix'] as const,
  responsibilityAreas: (companyId: string) => ['companies', companyId, 'responsibilities', 'areas'] as const,
};
