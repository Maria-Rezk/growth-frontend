import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { WidgetBody } from '@/components/admin/WidgetCard';
import { appRoutes } from '@/config/appRoutes';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import type { AdminOverview, DashboardFilters } from '@/types/domain';

type Tone = 'accent' | 'info' | 'warning' | 'success' | 'neutral';

/** Poll interval for the cheap widgets. Paused while the tab is hidden. */
export const FAST_REFRESH_MS = 60_000;

/**
 * The nine-number KPI row — one request, refreshed on mount, on filter change
 * and every 60 s while the tab is visible.
 *
 * Tiles link to a drill-down only where one genuinely exists. `overdue`,
 * `blockedTasks` and `waitingClientApproval` are the same items the attention
 * feed lists, so they focus it rather than opening a screen no endpoint backs;
 * `overdueLeadFollowUps` opens `/dashboard/leads/overdue`.
 */
export function KpiRow({
  filters,
  onShowAttention,
  onShowOverdueLeads,
}: {
  filters: DashboardFilters;
  onShowAttention: () => void;
  onShowOverdueLeads: () => void;
}) {
  const state = useAsync(() => adminDashboardService.overview(filters), [filters], {
    queryKey: queryKeys.adminWidget('overview', filters),
    refetchInterval: FAST_REFRESH_MS,
  });

  return (
    <section aria-label="Key numbers">
      <WidgetBody state={state} rows={3}>
        {(overview: AdminOverview) => (
          <div className="kpi-grid">
            <Kpi label="Active clients" value={overview.activeClients} tone="accent" to={appRoutes.adminClients} />
            <Kpi label="Active employees" value={overview.activeEmployees} tone="accent" to={appRoutes.adminEmployees} />
            <Kpi label="Due today" value={overview.dueToday} tone="info" />
            <Kpi label="Overdue" value={overview.overdue} tone="warning" onSelect={onShowAttention} />
            <Kpi label="Blocked tasks" value={overview.blockedTasks} tone="warning" onSelect={onShowAttention} />
            <Kpi label="Waiting on clients" value={overview.waitingClientApproval} tone="info" onSelect={onShowAttention} />
            <Kpi label="Follow-ups today" value={overview.leadFollowUpsToday} tone="neutral" />
            <Kpi label="Overdue follow-ups" value={overview.overdueLeadFollowUps} tone="warning" onSelect={onShowOverdueLeads} />
            <Kpi label="Published today" value={overview.publishedToday} tone="success" />
          </div>
        )}
      </WidgetBody>
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
  to,
  onSelect,
}: {
  label: string;
  value: number | undefined;
  tone: Tone;
  to?: string;
  onSelect?: () => void;
}) {
  const className = `card metric-card kpi-tile metric-card--${tone}`;
  const body: ReactNode = (
    <>
      <span>{label}</span>
      {/* An em dash, never a blank — a missing number must not read as zero. */}
      <strong>{value ?? '—'}</strong>
    </>
  );

  if (to) return <Link to={to} className={`${className} kpi-tile--action`}>{body}</Link>;
  if (onSelect) {
    return (
      <button type="button" className={`${className} kpi-tile--action`} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
