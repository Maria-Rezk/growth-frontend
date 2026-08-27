import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatStrip } from '@/components/admin/WidgetPrimitives';
import { EmptyState } from '@/components/ui/State';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatDateTime, humanize } from '@/utils/format';
import type { AutomationsSummary, DashboardFilters } from '@/types/domain';

export function AutomationsCard({ filters, enabled = true }: { filters: DashboardFilters; enabled?: boolean }) {
  const state = useAsync(() => adminDashboardService.automations(filters), [filters], {
    queryKey: queryKeys.adminWidget('automations', filters),
    enabled,
  });

  return (
    <WidgetCard title="Automations" subtitle="Rule reliability today." state={state} rows={5}>
      {(data: AutomationsSummary) => (
        <>
          <StatStrip>
            <Stat label="Runs today" value={data.runsToday} />
            <Stat label="Successful" value={data.successfulRuns} tone="success" />
            <Stat label="Failed" value={data.failedRuns} tone={data.failedRuns ? 'warning' : undefined} />
            <Stat label="Active rules" value={data.activeRules} />
            <Stat label="Inactive rules" value={data.inactiveRules} />
          </StatStrip>

          {data.lastFailedRuns.length === 0 ? (
            <EmptyState title="No failures" description="Every automation run today completed." />
          ) : (
            <ul className="failure-list">
              {data.lastFailedRuns.map((run) => (
                <li key={run.runId} className="failure-row">
                  <div>
                    <strong>{run.ruleName}</strong>
                    <p className="muted">
                      {run.client.name} · {humanize(run.trigger)} → {humanize(run.action)}
                    </p>
                  </div>
                  {/* The error string is the only clue for debugging a broken rule — show it verbatim. */}
                  <p className="failure-row__error">{run.error}</p>
                  <time dateTime={run.failedAt}>{formatDateTime(run.failedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </WidgetCard>
  );
}
