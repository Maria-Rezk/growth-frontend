import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatBars, StatStrip } from '@/components/admin/WidgetPrimitives';
import { Button } from '@/components/ui/Button';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatRatioPercent } from '@/utils/format';
import { LeadStatus, type DashboardFilters, type LeadsSummary } from '@/types/domain';

const STATUS_ORDER = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.INTERESTED,
  LeadStatus.WAITING_DECISION,
  LeadStatus.FOLLOW_UP_LATER,
  LeadStatus.WON,
  LeadStatus.LOST,
] as const;

export function LeadsCard({
  filters,
  onShowOverdue,
}: {
  filters: DashboardFilters;
  onShowOverdue: () => void;
}) {
  const state = useAsync(() => adminDashboardService.leads(filters), [filters], {
    queryKey: queryKeys.adminWidget('leads', filters),
  });

  return (
    <WidgetCard
      title="Sales pipeline"
      subtitle="Lead volume and follow-up debt."
      action={<Button variant="secondary" size="sm" onClick={onShowOverdue}>Overdue follow-ups</Button>}
      state={state}
      rows={6}
    >
      {(data: LeadsSummary) => (
        <>
          <StatBars counts={data.byStatus} order={STATUS_ORDER} highlight={[LeadStatus.WAITING_DECISION]} />
          <StatStrip>
            <Stat label="New today" value={data.newToday} tone="info" />
            <Stat label="Follow-ups today" value={data.followUpsToday} />
            <Stat label="Overdue follow-ups" value={data.overdueFollowUps} tone="warning" />
            <Stat label="Won this month" value={data.wonThisMonth} tone="success" />
            <Stat label="Lost this month" value={data.lostThisMonth} />
            {/*
              A server-computed ratio, filtered differently from the counts
              beside it. Formatted, never recomputed from won/lost.
            */}
            <Stat label="Conversion rate" value={formatRatioPercent(data.conversionRate)} />
          </StatStrip>
        </>
      )}
    </WidgetCard>
  );
}
