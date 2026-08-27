import { useMemo, useState } from 'react';
import { WidgetCard } from '@/components/admin/WidgetCard';
import { EmptyState } from '@/components/ui/State';
import { Pagination } from '@/components/ui/Pagination';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import type { DashboardFilters, PageEnvelope, TeamWorkloadRow } from '@/types/domain';

const PAGE_SIZE = 20;

const COLUMNS: Array<{ key: keyof TeamWorkloadRow; header: string }> = [
  { key: 'clients', header: 'Clients' },
  { key: 'openTasks', header: 'Open' },
  { key: 'dueToday', header: 'Due today' },
  { key: 'overdue', header: 'Overdue' },
  { key: 'blocked', header: 'Blocked' },
  { key: 'inReview', header: 'In review' },
  { key: 'urgent', header: 'Urgent' },
];

/**
 * Team table — one row per employee, one column per metric.
 *
 * There is deliberately no load percentage or progress bar. The backend
 * returns objective counts only; a "% loaded" figure would need a weighting
 * rule that does not exist yet, and inventing one here would make a guess look
 * like a measurement. Show the numbers and let the reader judge.
 *
 * Sorting is client-side and applies to the current page — the API paginates,
 * so a sort cannot claim to be agency-wide.
 */
export function TeamWorkloadCard({ filters, enabled = true }: { filters: DashboardFilters; enabled?: boolean }) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof TeamWorkloadRow>('overdue');
  const [descending, setDescending] = useState(true);

  const pageFilters: DashboardFilters = { ...filters, page, limit: PAGE_SIZE };
  const state = useAsync(() => adminDashboardService.teamWorkload(pageFilters), [pageFilters], {
    queryKey: queryKeys.adminWidget('team-workload', pageFilters),
    enabled,
  });

  const rows = useMemo(() => {
    const items = state.data?.items ?? [];
    return [...items].sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return descending ? -result : result;
    });
  }, [descending, sortKey, state.data]);

  const toggleSort = (key: keyof TeamWorkloadRow) => {
    if (key === sortKey) setDescending((current) => !current);
    else {
      setSortKey(key);
      setDescending(true);
    }
  };

  return (
    <WidgetCard title="Team workload" subtitle="Objective counts per employee. Sort by any column." state={state} rows={6}>
      {(data: PageEnvelope<TeamWorkloadRow>) => (
        <>
          {data.items.length === 0 ? (
            <EmptyState title="No employees in this range" />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    {COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        aria-sort={sortKey === column.key ? (descending ? 'descending' : 'ascending') : undefined}
                      >
                        <button type="button" className="table-sort-button" onClick={() => toggleSort(column.key)}>
                          <span>{column.header}</span>
                          <span
                            className={sortKey === column.key ? 'table-sort-icon table-sort-icon--active' : 'table-sort-icon'}
                            aria-hidden="true"
                          >
                            {sortKey === column.key ? (descending ? '↓' : '↑') : '↕'}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.employeeId}>
                      <td><strong>{row.name}</strong></td>
                      {/*
                        BE-10's example omits `inReview` that its own prose
                        lists — an em dash beats an empty cell reading as zero.
                      */}
                      {COLUMNS.map((column) => (
                        <td key={column.key}>{row[column.key] ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.pagination.totalPages > 1 ? (
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </WidgetCard>
  );
}
