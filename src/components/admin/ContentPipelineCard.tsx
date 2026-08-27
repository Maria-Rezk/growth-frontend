import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatBars, StatStrip } from '@/components/admin/WidgetPrimitives';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatHours } from '@/utils/format';
import { PostStatus, type ContentPipeline, type DashboardFilters } from '@/types/domain';

/** Pipeline order, not alphabetical — the funnel only reads as a funnel in flow order. */
const STATUS_ORDER = [
  PostStatus.DRAFT,
  PostStatus.IN_INTERNAL_REVIEW,
  PostStatus.READY_FOR_CLIENT,
  PostStatus.CHANGES_REQUESTED,
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.PUBLISHED,
  PostStatus.CANCELED,
] as const;

const NEEDS_ACTION = [PostStatus.READY_FOR_CLIENT, PostStatus.CHANGES_REQUESTED] as const;

export function ContentPipelineCard({ filters }: { filters: DashboardFilters }) {
  const state = useAsync(() => adminDashboardService.content(filters), [filters], {
    queryKey: queryKeys.adminWidget('content', filters),
  });

  return (
    <WidgetCard title="Content pipeline" subtitle="Where every post sits right now." state={state} rows={6}>
      {(data: ContentPipeline) => (
        <>
          <StatBars counts={data.byStatus} order={STATUS_ORDER} highlight={NEEDS_ACTION} />
          <StatStrip>
            <Stat label="Published today" value={data.publishedToday} tone="success" />
            <Stat label="Scheduled today" value={data.scheduledToday} />
            <Stat label="Awaiting client" value={data.awaitingClientAction} tone="info" />
            <Stat label="Changes requested" value={data.changesRequested} tone="warning" />
            <Stat
              label="Avg approval wait"
              value={formatHours(data.averageApprovalWaitHours)}
              hint="Average time a post spends waiting on the client."
            />
            {/*
              These posts are past their scheduled time and need a human to
              press publish — the same items the attention feed lists as
              PUBLISHING_DUE. Badged rather than buried in the strip.
            */}
            <Stat
              label="Publishing due"
              value={
                data.publishingDue > 0
                  ? <Badge tone="danger">{data.publishingDue} to publish</Badge>
                  : 0
              }
              hint="Scheduled time has passed — publish these manually."
            />
          </StatStrip>
        </>
      )}
    </WidgetCard>
  );
}
