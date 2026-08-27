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
function healthTooltip(inputs: Record<string, number | string> | undefined): string {
  return Object.entries(inputs ?? {})
    .map(([key, value]) => `${humanize(key)}: ${value}`)
    .join('\n');
}

/**
 * A row with every nested group guaranteed present.
 *
 * BE-17's example payload omits `campaigns`, `contentPlan`, `healthInputs` and
 * half of `content`, even though its prose and the frontend contract include
 * them. Reading `row.campaigns.active` off that response is a TypeError, so a
 * partial first cut of the endpoint would blank the widget rather than show
 * the columns it *can* fill.
 */
function safeRow(row: ClientHealthRow) {
  return {
    tasks: (row.tasks ?? {}) as Partial<ClientHealthRow['tasks']>,
    content: (row.content ?? {}) as Partial<ClientHealthRow['content']>,
    leads: (row.leads ?? {}) as Partial<ClientHealthRow['leads']>,
    campaigns: (row.campaigns ?? {}) as Partial<ClientHealthRow['campaigns']>,
    contentPlan: (row.contentPlan ?? {}) as Partial<ClientHealthRow['contentPlan']>,
  };
}

/** `—` rather than a blank cell, so a missing number never reads as zero. */
function num(value: number | undefined): string {
  return value === undefined || value === null ? '—' : String(value);
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
                  {data.items.map((row) => {
                    const cell = safeRow(row);
                    return (
                    <tr key={row.clientId} title={healthTooltip(row.healthInputs)}>
                      <td>
                        <strong>{row.clientName}</strong>
                        <p className="muted">{humanize(row.status)}</p>
                      </td>
                      <td>
                        {num(cell.tasks.open)} open
                        <p className="muted">{num(cell.tasks.overdue)} overdue · {num(cell.tasks.blocked)} blocked</p>
                      </td>
                      <td>
                        {num(cell.content.waitingApproval)} waiting
                        <p className="muted">{num(cell.content.changesRequested)} changes · {num(cell.content.scheduled)} scheduled</p>
                      </td>
                      <td>
                        {num(cell.leads.open)} open
                        <p className="muted">{num(cell.leads.overdueFollowUps)} overdue</p>
                      </td>
                      <td>{num(cell.campaigns.active)}</td>
                      <td>
                        <Badge tone={cell.contentPlan.status === 'MISSING' ? 'danger' : 'neutral'}>
                          {humanize(cell.contentPlan.status)}
                        </Badge>
                      </td>
                      <td className="cell-right">
                        <Button variant="secondary" size="sm" onClick={() => openWorkspace(row)}>Open</Button>
                      </td>
                    </tr>
                    );
                  })}
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
