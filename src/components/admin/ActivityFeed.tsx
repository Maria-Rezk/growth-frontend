import { useState } from 'react';
import { WidgetCard } from '@/components/admin/WidgetCard';
import { EmptyState } from '@/components/ui/State';
import { Pagination } from '@/components/ui/Pagination';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatDateTime, humanize } from '@/utils/format';
import type { ActivityItem, DashboardFilters, PageEnvelope } from '@/types/domain';

const REFRESH_MS = 30_000;

/**
 * Readable labels for the actions worth phrasing well. `action` is an open
 * set, so anything missing falls back to a humanised version of the raw
 * string — a new backend action reads as "Post scheduled", never as a blank.
 */
const ACTION_LABELS: Record<string, string> = {
  POST_APPROVED: 'approved a post',
  POST_PUBLISHED: 'published a post',
  POST_REJECTED: 'rejected a post',
  POST_CHANGES_REQUESTED: 'requested changes on a post',
  TASK_ASSIGNED: 'assigned a task',
  TASK_STATUS_CHANGED: 'moved a task',
  LEAD_STATUS_CHANGED: 'moved a lead',
  CLIENT_CREATED: 'added a client',
  CLIENT_RENAMED: 'renamed a client',
  CLIENT_DELETED: 'deleted a client',
  MEMBER_ADDED: 'assigned someone to a client',
  MEMBER_REMOVED: 'removed someone from a client',
  PLATFORM_ROLE_CHANGED: 'changed a platform role',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanize(action).toLowerCase();
}

/** `{ from: 'READY_FOR_CLIENT', to: 'APPROVED' }` → `Ready For Client → Approved`. */
function transition(metadata?: Record<string, unknown>): string | null {
  const from = metadata?.from;
  const to = metadata?.to;
  if (typeof to !== 'string') return null;
  return typeof from === 'string' ? `${humanize(from)} → ${humanize(to)}` : humanize(to);
}

export function ActivityFeed({ filters, limit = 10 }: { filters: DashboardFilters; limit?: number }) {
  const [page, setPage] = useState(1);
  const pageFilters: DashboardFilters = { ...filters, page, limit };

  const state = useAsync(() => adminDashboardService.activity(pageFilters), [pageFilters], {
    queryKey: queryKeys.adminWidget('activity', pageFilters),
    refetchInterval: REFRESH_MS,
  });

  return (
    <WidgetCard title="Recent agency activity" subtitle="Newest first, across every client." state={state} rows={6}>
      {(data: PageEnvelope<ActivityItem>) => (
        <>
          {data.items.length === 0 ? (
            <EmptyState title="No activity in this range" />
          ) : (
            <ul className="activity-list">
              {data.items.map((item) => {
                const change = transition(item.metadata);
                return (
                  <li key={item.id} className="activity-row">
                    <div>
                      <strong>{item.actor?.name ?? 'Someone'}</strong>{' '}
                      <span className="activity-row__action">{actionLabel(item.action)}</span>
                      {/*
                        The client name is a stored snapshot — a deleted client
                        still appears here. Rendered as text, never a link into
                        a workspace that may no longer exist.
                      */}
                      {item.client ? <span className="activity-row__client"> · {item.client.name}</span> : null}
                    </div>
                    {change ? <p className="muted">{change}</p> : null}
                    <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                  </li>
                );
              })}
            </ul>
          )}

          {data.pagination.totalPages > 1 ? (
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </WidgetCard>
  );
}
