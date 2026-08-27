import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { ApprovalsCard } from '@/components/admin/ApprovalsCard';
import { AttentionFeed } from '@/components/admin/AttentionFeed';
import { AutomationsCard } from '@/components/admin/AutomationsCard';
import { CampaignsCard } from '@/components/admin/CampaignsCard';
import { ClientHealthCard } from '@/components/admin/ClientHealthCard';
import { ContentPipelineCard } from '@/components/admin/ContentPipelineCard';
import { ContentPlansCard } from '@/components/admin/ContentPlansCard';
import { KpiRow } from '@/components/admin/KpiRow';
import { LeadsCard } from '@/components/admin/LeadsCard';
import { OverdueLeadsModal } from '@/components/admin/OverdueLeadsModal';
import { SystemHealthStrip } from '@/components/admin/SystemHealthStrip';
import { TaskHealthCard } from '@/components/admin/TaskHealthCard';
import { TeamWorkloadCard } from '@/components/admin/TeamWorkloadCard';
import { SuperAdminOnly } from '@/components/layout/RequireAdmin';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { appRoutes } from '@/config/appRoutes';
import { useAuth } from '@/context/AuthContext';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { humanize } from '@/utils/format';
import type { DashboardFilters } from '@/types/domain';

type DeepDive = 'team' | 'clients' | 'campaigns' | 'plans' | 'automations';

const DEEP_DIVE_TABS: Array<{ label: string; value: DeepDive }> = [
  { label: 'Team', value: 'team' },
  { label: 'Client health', value: 'clients' },
  { label: 'Campaigns', value: 'campaigns' },
  { label: 'Content plans', value: 'plans' },
  { label: 'Automations', value: 'automations' },
];

/**
 * Operations dashboard — open to Admin and Super Admin alike.
 *
 * Both roles see the whole agency: there is no "my clients only" mode, and the
 * client dropdown narrows the numbers rather than granting access. The only
 * role difference on this screen is the system health strip.
 *
 * Every widget owns its own request, loading state and error state — nothing
 * here awaits a combined response, so one slow or unshipped endpoint degrades
 * a single card instead of the page.
 */
export function AdminDashboardPage() {
  const { user } = useAuth();
  const { filters, setFilters, resetFilters } = useDashboardFilters();
  const [deepDive, setDeepDive] = useState<DeepDive>('team');
  const [overdueLeadsOpen, setOverdueLeadsOpen] = useState(false);
  const attentionRef = useRef<HTMLDivElement>(null);

  /*
    One filter object shared by every widget, and the identity is stable
    because `useDashboardFilters` memoises on the URL. That matters: it is part
    of each widget's query key, so an unstable object would refetch twelve
    endpoints on every render.
  */
  const sharedFilters = useMemo<DashboardFilters>(() => ({ ...filters }), [filters]);

  const showAttention = useCallback(() => {
    attentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        subtitle="Everything that needs a decision today, across every client."
        action={(
          <>
            <Badge tone="accent">{humanize(user?.platformRole)}</Badge>
            <ButtonLink to={appRoutes.adminClients} variant="secondary" size="sm">Clients</ButtonLink>
            <ButtonLink to={appRoutes.adminEmployees} variant="secondary" size="sm">Employees</ButtonLink>
          </>
        )}
      />

      {/* Super Admin only. If the Product Owner widens platform health to
          Admin, deleting this wrapper is the entire frontend change. */}
      <SuperAdminOnly>
        <SystemHealthStrip />
      </SuperAdminOnly>

      <AdminFilterBar filters={filters} onChange={setFilters} onReset={resetFilters} />

      <KpiRow
        filters={sharedFilters}
        onShowAttention={showAttention}
        onShowOverdueLeads={() => setOverdueLeadsOpen(true)}
      />

      <div className="dashboard-grid dashboard-grid--senior" ref={attentionRef}>
        <AttentionFeed filters={sharedFilters} />
        <ActivityFeed
          filters={sharedFilters}
          action={<ButtonLink to={appRoutes.adminActivity} variant="secondary" size="sm">View all</ButtonLink>}
        />
      </div>

      <div className="grid-2">
        <ContentPipelineCard filters={sharedFilters} />
        <ApprovalsCard filters={sharedFilters} />
      </div>

      <div className="grid-2">
        <TaskHealthCard filters={sharedFilters} onShowAttention={showAttention} />
        <LeadsCard filters={sharedFilters} onShowOverdue={() => setOverdueLeadsOpen(true)} />
      </div>

      <section className="section-block">
        <SectionHeader
          title="Deep dive"
          subtitle="Loaded on demand — these queries are the expensive ones."
          action={<SegmentedControl label="Deep dive view" value={deepDive} options={DEEP_DIVE_TABS} onChange={setDeepDive} />}
        />
        {/*
          Only the visible tab is mounted, so switching tabs is what triggers
          the fetch. The four hidden queries never run.
        */}
        {deepDive === 'team' ? <TeamWorkloadCard filters={sharedFilters} /> : null}
        {deepDive === 'clients' ? <ClientHealthCard filters={sharedFilters} /> : null}
        {deepDive === 'campaigns' ? <CampaignsCard filters={sharedFilters} /> : null}
        {deepDive === 'plans' ? <ContentPlansCard filters={sharedFilters} /> : null}
        {deepDive === 'automations' ? <AutomationsCard filters={sharedFilters} /> : null}
      </section>

      <OverdueLeadsModal
        open={overdueLeadsOpen}
        filters={sharedFilters}
        onClose={() => setOverdueLeadsOpen(false)}
      />
    </>
  );
}
