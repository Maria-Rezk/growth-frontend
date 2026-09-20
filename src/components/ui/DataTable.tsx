import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';
import { Button } from '@/components/ui/Button';
import { compareNames } from '@/utils/sort';
import { TableSkeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  sortValue?: (row: T) => string | number | null | undefined;
}

type SortDirection = 'asc' | 'desc';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyTitle = 'No records',
  emptyDescription,
  emptyAction,
  onRetry,
  pageSize = 10,
  defaultSortKey,
  defaultSortDirection = 'asc',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  /** The next thing to do when the table is empty — a button or a link. An empty page should never be a dead end. */
  emptyAction?: ReactNode;
  onRetry?: () => void;
  pageSize?: number;
  /**
   * Column to sort on before anyone touches a header. Must name a column that
   * has a `sortValue`, or it is ignored.
   *
   * Rows arriving in a sensible order is not the same as the table being
   * sorted: without this the header shows no active sort, so the order looks
   * incidental, and sorting by another column is a one-way trip.
   */
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
}) {
  const sortableColumns = useMemo(() => new Set(columns.filter((column) => column.sortValue).map((column) => column.key)), [columns]);
  // Initial state only — a later change to the prop is not meant to yank the
  // table out from under a sort the user chose.
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [page, setPage] = useState(1);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const column = columns.find((item) => item.key === sortKey);
    if (!column?.sortValue) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = column.sortValue?.(left);
      const rightValue = column.sortValue?.(right);
      if (leftValue === rightValue) return 0;
      if (leftValue === null || leftValue === undefined) return 1;
      if (rightValue === null || rightValue === undefined) return -1;
      /*
        Text columns go through the collator so a header click gives real A→Z
        order — `>` on strings is ASCII, which files every lowercase name after
        every uppercase one.
      */
      const result = typeof leftValue === 'string' && typeof rightValue === 'string'
        ? compareNames(leftValue, rightValue)
        : leftValue > rightValue ? 1 : -1;
      return sortDirection === 'asc' ? result : -result;
    });
  }, [columns, rows, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: string) => {
    if (!sortableColumns.has(key)) return;
    setPage(1);
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  if (loading) return <TableSkeleton columns={columns.length} />;
  if (error) return <CardShell><ErrorState message={error} onRetry={onRetry} /></CardShell>;
  if (!rows.length) return <CardShell><EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} /></CardShell>;

  return (
    <div className="card table-card">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const sortable = sortableColumns.has(column.key);
                return (
                  <th key={column.key} className={column.className} aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {sortable ? (
                      <button className="table-sort-button" type="button" onClick={() => toggleSort(column.key)}>
                        <span>{column.header}</span>
                        <span className={sortKey === column.key ? 'table-sort-icon table-sort-icon--active' : 'table-sort-icon'} aria-hidden="true">
                          {sortKey === column.key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="table-pagination" aria-label="Table pagination">
          <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedRows.length)} of {sortedRows.length}</span>
          <div>
            <Button variant="secondary" size="sm" type="button" disabled={currentPage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button variant="secondary" size="sm" type="button" disabled={currentPage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}
