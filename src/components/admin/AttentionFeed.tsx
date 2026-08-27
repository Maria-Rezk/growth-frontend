import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WidgetCard } from '@/components/admin/WidgetCard';
import { attentionMeta, severityTone } from '@/components/admin/attentionMeta';
import { FAST_REFRESH_MS } from '@/components/admin/KpiRow';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/State';
import { Pagination } from '@/components/ui/Pagination';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatAgeMinutes, formatDateTime } from '@/utils/format';
import type { AttentionItem, DashboardFilters, PageEnvelope } from '@/types/domain';

const PAGE_SIZE = 20;

/**
 * The "Needs attention" feed — the widget people actually work from.
 *
 * The order is a product rule computed server-side (severity, then urgency),
 * so this list is never re-sorted client-side. Rows route by `type` +
 * `entityId`; a type this build does not know still renders, carrying its own
 * title, rather than disappearing from the feed.
 */
export function AttentionFeed({ filters }: { filters: DashboardFilters }) {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { setActiveCompanyId } = useCompany();

  // A narrower filter can leave the current page past the end of the results.
  useEffect(() => { setPage(1); }, [filters]);

  const pageFilters: DashboardFilters = { ...filters, page, limit: PAGE_SIZE };
  const state = useAsync(() => adminDashboardService.attention(pageFilters), [pageFilters], {
    queryKey: queryKeys.adminWidget('attention', pageFilters),
    refetchInterval: FAST_REFRESH_MS,
  });

  /*
    Opening a row means entering that item's client workspace: the detail
    screens are client-scoped, so the active company has to move with the
    navigation or the page renders someone else's task.
  */
  const open = (item: AttentionItem, path: string) => {
    setActiveCompanyId(item.client.id);
    navigate(path);
  };

  return (
    <WidgetCard
      title="Needs attention"
      subtitle="Ordered by severity, then urgency — the order is the product rule, not a preference."
      action={
        <Button variant="secondary" size="sm" onClick={() => void state.refetch()} loading={state.refreshing}>
          Refresh
        </Button>
      }
      state={state}
      rows={6}
    >
      {(data: PageEnvelope<AttentionItem>) => (
        <>
          {data.items.length === 0 ? (
            <EmptyState title="Nothing needs attention" description="No overdue, blocked or waiting work in this range." />
          ) : (
            <ul className="attention-list">
              {data.items.map((item) => {
                const { icon: Icon, reason, path } = attentionMeta(item);
                const meta = (
                  <>
                    <span className="attention-row__icon" aria-hidden="true"><Icon size={16} /></span>
                    <span className="attention-row__body">
                      <strong>{item.title}</strong>
                      <span className="attention-row__reason">{reason}</span>
                      <span className="attention-row__meta">
                        {item.client.name}
                        {' · '}
                        {item.owner ? item.owner.name : 'Unassigned'}
                        {item.dueAt ? ` · due ${formatDateTime(item.dueAt)}` : ''}
                      </span>
                    </span>
                    <span className="attention-row__side">
                      <Badge tone={severityTone(item.severity)}>{item.severity}</Badge>
                      <span className="attention-row__age">{formatAgeMinutes(item.ageMinutes)}</span>
                    </span>
                  </>
                );

                return (
                  <li key={`${item.type}-${item.entityId}`}>
                    {path ? (
                      <button type="button" className="attention-row attention-row--action" onClick={() => open(item, path)}>
                        {meta}
                      </button>
                    ) : (
                      <div className="attention-row">{meta}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {data.pagination.totalPages > 1 ? (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </WidgetCard>
  );
}
