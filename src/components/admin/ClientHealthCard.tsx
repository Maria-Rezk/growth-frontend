import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WidgetCard } from '@/components/admin/WidgetCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/State';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { humanize } from '@/utils/format';
import type { ClientHealthRow, DashboardFilters, PageEnvelope } from '@/types/domain';

const PAGE_SIZE = 20;

/** Raw health signals as a hover summary. Signals only — never a score. */
function healthTooltip(inputs: Record<string, number | string>): string {
  return Object.entries(inputs)
    .map(([key, value]) => `${humanize(key)}: ${value}`)
    .join('\n');
}

/**
 * Client health table — the row that answers "which client is in trouble".
 *
 * healthInputs are rendered as raw signals only. No score and no colour
 * formula is derived from them: that rule belongs to the Product Owner and
 * will arrive as a server value, and a frontend guess would be wrong the
 * moment it does.
 */
export function ClientHealthCard({ filters, enabled = true }: { filters: DashboardFilters; enabled?: boolean }) {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { setActiveCompanyId } = useCompany();

  const pageFilters: DashboardFilters = { ...filters, page, limit: PAGE_SIZE };
  const state = useAsync(() => adminDashboardService.clients(pageFilters), [pageFilters], {
    queryKey: queryKeys.adminWidget('clients', pageFilters),
    enabled,
  });

  const openWorkspace = (row: ClientHealthRow) => {
    setActiveCompanyId(row.clientId);
    navigate('/dashboard');
  };

  return (
    <WidgetCard
      title="Client health"
      subtitle="Signals per client. The counts are the signal — there is no score yet."
      state={state}
      rows={6}
    >
      {(data: PageEnvelope<ClientHealthRow>) => (
        <>
          {data.items.length === 0 ? (
            <EmptyState title="No clients in this range" />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Tasks</th>
                    <th>Content</th>
                    <th>Leads</th>
                    <th>Campaigns</th>
                    <th>Plan</th>
                    <th className="cell-right" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.clientId} title={healthTooltip(row.healthInputs)}>
                      <td>
                        <strong>{row.clientName}</strong>
                        <p className="muted">{humanize(row.status)}</p>
                      </td>
                      <td>
                        {row.tasks.open} open
                        <p className="muted">{row.tasks.overdue} overdue · {row.tasks.blocked} blocked</p>
                      </td>
                      <td>
                        {row.content.waitingApproval} waiting
                        <p className="muted">{row.content.changesRequested} changes · {row.content.scheduled} scheduled</p>
                      </td>
                      <td>
                        {row.leads.open} open
                        <p className="muted">{row.leads.overdueFollowUps} overdue</p>
                      </td>
                      <td>{row.campaigns.active}</td>
                      <td>
                        <Badge tone={row.contentPlan.status === 'MISSING' ? 'danger' : 'neutral'}>
                          {humanize(row.contentPlan.status)}
                        </Badge>
                      </td>
                      <td className="cell-right">
                        <Button variant="secondary" size="sm" onClick={() => openWorkspace(row)}>Open</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.pagination.totalPages > 1 ? (
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </WidgetCard>
  );
}
