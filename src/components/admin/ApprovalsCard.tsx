import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatStrip } from '@/components/admin/WidgetPrimitives';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/State';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatHours, humanize } from '@/utils/format';
import type { ApprovalsSummary, DashboardFilters, SlaState } from '@/types/domain';

/**
 * SLA state comes from the server because the threshold is configurable there.
 * Never derive it from `waitingHours` in the frontend — the two would drift
 * the first time someone changes the setting.
 */
const SLA_TONE: Record<SlaState, BadgeTone> = {
  NORMAL: 'neutral',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

function slaTone(state: string): BadgeTone {
  return SLA_TONE[state as SlaState] ?? 'neutral';
}

export function ApprovalsCard({ filters }: { filters: DashboardFilters }) {
  const state = useAsync(() => adminDashboardService.approvals(filters), [filters], {
    queryKey: queryKeys.adminWidget('approvals', filters),
  });

  return (
    <WidgetCard title="Waiting on clients" subtitle="Longest wait first." state={state} rows={6}>
      {(data: ApprovalsSummary) => (
        <>
          <StatStrip>
            <Stat label="Waiting" value={data.waiting} tone="info" />
            <Stat label="Over threshold" value={data.overThreshold} tone="warning" />
            <Stat label="Average wait" value={formatHours(data.averageWaitHours)} />
            <Stat label="Approved today" value={data.approvedToday} tone="success" />
            <Stat label="Rejected today" value={data.rejectedToday} />
          </StatStrip>

          {data.oldestWaiting ? (
            <p className="widget-note">
              Longest wait: <strong>{data.oldestWaiting.title}</strong> · {data.oldestWaiting.clientName} ·{' '}
              {formatHours(data.oldestWaiting.waitingHours)}{' '}
              <Badge tone={slaTone(data.oldestWaiting.slaState)}>{humanize(data.oldestWaiting.slaState)}</Badge>
            </p>
          ) : null}

          {/*
            BE-07's example omits `slaState` on these rows even though BE-08
            specifies it; `humanize` renders a missing one as an em dash rather
            than the literal "undefined".
          */}
          {(data.clients ?? []).length === 0 ? (
            <EmptyState title="Nothing waiting" description="No client has work sitting in their approval queue." />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Waiting</th>
                    <th>Oldest</th>
                    <th>Changes requested</th>
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Longest wait first — the row that needs chasing is the top one. */}
                  {[...(data.clients ?? [])]
                    .sort((left, right) => right.oldestWaitingHours - left.oldestWaitingHours)
                    .map((row) => (
                      <tr key={row.clientId}>
                        <td><strong>{row.clientName}</strong></td>
                        <td>{row.waiting}</td>
                        <td>{formatHours(row.oldestWaitingHours)}</td>
                        <td>{row.changesRequested}</td>
                        <td><Badge tone={slaTone(row.slaState)}>{humanize(row.slaState)}</Badge></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </WidgetCard>
  );
}
