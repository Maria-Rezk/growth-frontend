import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatStrip } from '@/components/admin/WidgetPrimitives';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/State';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatHours } from '@/utils/format';
import type { DashboardFilters, TaskHealth } from '@/types/domain';

/**
 * The agency's own approval gates — the mirror of "Waiting on clients".
 *
 * Reads the same `/dashboard/tasks` payload as the task health card, under
 * the same query key, so the two cards share one request. The five internal
 * approval numbers are optional on the wire: a backend that predates the
 * approval flow omits them, and that renders as "not available" rather than
 * as a row of zeros somebody would read as "nothing waiting".
 *
 * The per-approver table ignores the employee filter on purpose (the server
 * filters that by assignee, and an approver is not an assignee).
 */
export function InternalApprovalsCard({ filters }: { filters: DashboardFilters }) {
  const state = useAsync(() => adminDashboardService.tasks(filters), [filters], {
    queryKey: queryKeys.adminWidget('tasks', filters),
  });

  return (
    <WidgetCard title="Waiting on the team" subtitle="Internal approvals, longest wait first." state={state} rows={6}>
      {(data: TaskHealth) => {
        if (data.waitingInternalApproval === undefined) {
          return <EmptyState title="Not available yet" description="This backend does not report internal approvals." />;
        }
        const rows = data.internalApprovalByApprover ?? [];
        const orphaned = data.internalApprovalWithoutApprover ?? 0;
        const inactive = data.internalApprovalWithInactiveApprover ?? 0;
        return (
          <>
            <StatStrip>
              <Stat label="Waiting" value={data.waitingInternalApproval} tone="info" />
              <Stat label="Average wait" value={formatHours(data.averageInternalApprovalWaitHours)} />
              <Stat
                label="No approver"
                value={orphaned}
                tone={orphaned > 0 ? 'warning' : undefined}
                hint="In review with nobody named. Nothing happens to these until somebody is."
              />
              <Stat
                label="Approver left"
                value={inactive}
                tone={inactive > 0 ? 'warning' : undefined}
                hint="Waiting on a deactivated user. Re-route them from the task."
              />
            </StatStrip>

            {orphaned > 0 ? (
              <p className="widget-note">
                <strong>{orphaned}</strong> {orphaned === 1 ? 'task is' : 'tasks are'} in review with nobody to approve
                {orphaned === 1 ? ' it' : ' them'} — open each one and set an approver.
              </p>
            ) : null}

            {rows.length === 0 ? (
              <EmptyState title="Nobody is holding anything" description="No task is waiting on an internal approver." />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Approver</th>
                      <th>Waiting</th>
                      <th>Oldest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Server order is longest wait first; keep it. */}
                    {rows.map((row) => (
                      <tr key={row.userId} className={row.approverIsInactive ? 'approver-row--inactive' : undefined}>
                        <td>
                          <strong>{row.fullName}</strong>
                          {row.approverIsInactive ? <> <Badge tone="danger">Deactivated</Badge></> : null}
                        </td>
                        <td>{row.count}</td>
                        <td className={row.oldestWaitingHours >= 24 ? 'danger-text' : undefined}>{formatHours(row.oldestWaitingHours)}</td>
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
