import { useMemo, useState } from 'react';
import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatStrip } from '@/components/admin/WidgetPrimitives';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Fields';
import { EmptyState } from '@/components/ui/State';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { humanize } from '@/utils/format';
import type { ContentPlansGrid, DashboardFilters } from '@/types/domain';

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2000, index, 1)),
);

const PLAN_TONE: Record<string, BadgeTone> = {
  MISSING: 'danger',
  DRAFT: 'neutral',
  INTERNAL_REVIEW: 'info',
  CLIENT_REVIEW: 'warning',
  APPROVED: 'success',
  ARCHIVED: 'neutral',
};

/**
 * Content plan coverage for one month, one row per client.
 *
 * MISSING is the cell that matters: it is derived server-side — an active
 * client with no plan for the month — not a stored status. It is treated as a
 * first-class status here (danger badge, sorted to the top) because it is the
 * only row representing work nobody has started.
 */
export function ContentPlansCard({ filters, enabled = true }: { filters: DashboardFilters; enabled?: boolean }) {
  const currentYear = new Date().getFullYear();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(currentYear);

  const planFilters: DashboardFilters = { ...filters, month, year };
  const state = useAsync(() => adminDashboardService.contentPlans(planFilters), [planFilters], {
    queryKey: queryKeys.adminWidget('content-plans', planFilters),
    enabled,
  });

  const years = useMemo(() => [currentYear - 1, currentYear, currentYear + 1], [currentYear]);

  return (
    <WidgetCard
      title="Content plans"
      subtitle="Which clients have a plan for the selected month."
      action={(
        <div className="filter-row">
          <Select aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </Select>
          <Select aria-label="Year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </div>
      )}
      state={state}
      rows={6}
    >
      {(data: ContentPlansGrid) => {
        // MISSING first; everything else alphabetical.
        const rows = [...data.clients].sort((left, right) => {
          if (left.status !== right.status) {
            if (left.status === 'MISSING') return -1;
            if (right.status === 'MISSING') return 1;
          }
          return left.clientName.localeCompare(right.clientName);
        });

        return (
          <>
            <StatStrip>
              {Object.entries(data.byStatus).map(([status, count]) => (
                <Stat
                  key={status}
                  label={humanize(status)}
                  value={count}
                  tone={status === 'MISSING' ? 'warning' : status === 'APPROVED' ? 'success' : undefined}
                />
              ))}
            </StatStrip>

            {rows.length === 0 ? (
              <EmptyState title="No clients to plan for" />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Plan status</th>
                      <th>Account manager</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.clientId}>
                        <td><strong>{row.clientName}</strong></td>
                        <td><Badge tone={PLAN_TONE[row.status] ?? 'neutral'}>{humanize(row.status)}</Badge></td>
                        <td>{row.accountManager?.name ?? <span className="muted">Unassigned</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      }}
    </WidgetCard>
  );
}
