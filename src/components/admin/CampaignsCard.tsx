import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatStrip } from '@/components/admin/WidgetPrimitives';
import { EmptyState } from '@/components/ui/State';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatDate, humanize } from '@/utils/format';
import type { CampaignsSummary, DashboardFilters } from '@/types/domain';

/**
 * Campaign progress is shown as three separate "12 of 16" pairs — tasks, posts
 * and leads — and never blended into one percentage. The weighting between
 * them is undefined, so a single bar would be an invented product rule.
 */
export function CampaignsCard({ filters, enabled = true }: { filters: DashboardFilters; enabled?: boolean }) {
  const state = useAsync(() => adminDashboardService.campaigns(filters), [filters], {
    queryKey: queryKeys.adminWidget('campaigns', filters),
    enabled,
  });

  return (
    <WidgetCard title="Campaigns" subtitle="What is live and how far along it is." state={state} rows={6}>
      {(data: CampaignsSummary) => {
        const counts = data.counts ?? ({} as CampaignsSummary['counts']);
        const active = data.active ?? [];
        return (
        <>
          <StatStrip>
            <Stat label="Active" value={counts.active ?? '—'} tone="info" />
            <Stat label="Draft" value={counts.draft ?? '—'} />
            <Stat label="Paused" value={counts.paused ?? '—'} />
            <Stat label="Completed" value={counts.completed ?? '—'} tone="success" />
            <Stat label="Ending soon" value={counts.endingSoon ?? '—'} tone="warning" />
            <Stat label="With overdue tasks" value={counts.withOverdueTasks ?? '—'} tone="warning" />
          </StatStrip>

          {active.length === 0 ? (
            <EmptyState title="No active campaigns" />
          ) : (
            <ul className="campaign-list">
              {active.map((campaign) => (
                <li key={campaign.campaignId} className="campaign-row">
                  <div className="campaign-row__head">
                    <strong>{campaign.name}</strong>
                    <span className="muted">
                      {campaign.client?.name ?? 'Unknown client'} · {humanize(campaign.objective)} ·{' '}
                      {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}
                    </span>
                  </div>
                  <div className="campaign-row__progress">
                    <Progress label="Tasks" done={campaign.tasks?.completed} total={campaign.tasks?.total} />
                    <Progress label="Posts" done={campaign.posts?.published} total={campaign.posts?.total} />
                    <Progress label="Leads won" done={campaign.leads?.won} total={campaign.leads?.total} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
        );
      }}
    </WidgetCard>
  );
}

function Progress({ label, done, total }: { label: string; done?: number; total?: number }) {
  return (
    <div className="campaign-progress">
      <span className="campaign-progress__label">{label}</span>
      <strong>{done ?? '—'} of {total ?? '—'}</strong>
    </div>
  );
}
