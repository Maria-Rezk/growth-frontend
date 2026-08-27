import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WidgetBody } from '@/components/admin/WidgetCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/State';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { formatDate, humanize } from '@/utils/format';
import type { DashboardFilters, OverdueLeadRow, PageEnvelope } from '@/types/domain';

const PAGE_SIZE = 20;

/**
 * Drill-down behind "overdue follow-ups".
 *
 * A lead qualifies when its follow-up date has passed and it is neither WON
 * nor LOST — that rule lives on the server; this list just renders what it
 * returns. Opening a row enters the lead's client workspace, since the lead
 * detail screen is client-scoped.
 */
export function OverdueLeadsModal({
  open,
  filters,
  onClose,
}: {
  open: boolean;
  filters: DashboardFilters;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { setActiveCompanyId } = useCompany();

  const pageFilters: DashboardFilters = { ...filters, page, limit: PAGE_SIZE };
  const state = useAsync(() => adminDashboardService.overdueLeads(pageFilters), [pageFilters], {
    queryKey: queryKeys.adminWidget('leads-overdue', pageFilters),
    enabled: open,
  });

  const openLead = (row: OverdueLeadRow) => {
    setActiveCompanyId(row.client.id);
    navigate(`/leads/${row.leadId}`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Overdue follow-ups" wide>
      <WidgetBody state={state} rows={6}>
        {(data: PageEnvelope<OverdueLeadRow>) => (
          <>
            {data.items.length === 0 ? (
              <EmptyState title="No overdue follow-ups" description="Every open lead has been followed up on time." />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Client</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th>Overdue</th>
                      <th className="cell-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.leadId}>
                        <td><strong>{row.leadName}</strong></td>
                        <td>{row.client.name}</td>
                        <td>{row.assignedTo?.name ?? <span className="muted">Unassigned</span>}</td>
                        <td><Badge tone="neutral">{humanize(row.status)}</Badge></td>
                        <td>{formatDate(row.followUpDate)}</td>
                        <td>
                          <Badge tone={row.overdueDays >= 3 ? 'danger' : 'warning'}>
                            {row.overdueDays >= 1 ? `${row.overdueDays}d` : `${row.overdueHours}h`}
                          </Badge>
                        </td>
                        <td className="cell-right">
                          <Button variant="secondary" size="sm" onClick={() => openLead(row)}>Open lead</Button>
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
      </WidgetBody>
    </Modal>
  );
}
