import { useMemo, useState } from 'react';
import { WidgetCard } from '@/components/admin/WidgetCard';
import { EmptyState } from '@/components/ui/State';
import { Pagination } from '@/components/ui/Pagination';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import type { DashboardFilters, PageEnvelope, TeamWorkloadRow } from '@/types/domain';
import { compareNames } from '@/utils/sort';

const PAGE_SIZE = 20;

type SortKey = keyof TeamWorkloadRow;

const COLUMNS: Array<{ key: SortKey; header: string }> = [
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
  // A→Z on the employee name, matching every other list of people in the app.
  // Overdue-first is one click away on its own header.
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [descending, setDescending] = useState(false);

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
      const result = typeof a === 'number' && typeof b === 'number'
        ? a - b
        // Same collator as the rest of the app: case- and accent-insensitive,
        // so "massa" is not filed after every capitalised name.
        : compareNames(String(a ?? ''), String(b ?? ''));
      return descending ? -result : result;
    });
  }, [descending, sortKey, state.data]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDescending((current) => !current);
      return;
    }
    setSortKey(key);
    // Names read best A→Z; counts read best worst-first.
    setDescending(key !== 'name');
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
                    {/* Employee is a sortable column like the rest — it is the
                        one the table opens on, so it cannot be the only header
                        with no control and no sort indicator. */}
                    {[{ key: 'name' as SortKey, header: 'Employee' }, ...COLUMNS].map((column) => (
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
