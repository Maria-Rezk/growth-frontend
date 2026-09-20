import { useMemo, useState } from 'react';
import { ApprovalQueueList, type QueueTask } from '@/components/domain/ApprovalQueue';
import { ClientFilter, type ClientFilterValue } from '@/components/domain/ClientFilter';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Card';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { appRoutes } from '@/config/appRoutes';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { myReviewsService } from '@/services/myWork';

/**
 * The approval queue — everything waiting on *me*, across every client.
 *
 * Deliberately not behind <RequireCompany>: an approver on five clients
 * should see one list, not tour five workspaces. Same fan-out as My work;
 * the client is a tag on the row and a filter, not a gate. Approving a row
 * sends the verdict to that row's client, whatever client is active.
 */
export function ApprovalQueuePage() {
  const { companies, loading, error, refreshCompanies } = useCompany();

  if (loading) return <><PageHeader title="Approval queue" subtitle={SUBTITLE} /><ListSkeleton rows={4} /></>;
  if (error) return <ErrorState message={error} onRetry={refreshCompanies} />;
  if (companies.length === 0) {
    return <EmptyState title="No client assigned yet" description="You are not assigned to any client yet — ask your manager." />;
  }
  return <ApprovalQueueInner />;
}

const SUBTITLE = 'Tasks submitted to you for review, across every client you approve on. Oldest first.';

function ApprovalQueueInner() {
  const { companies } = useCompany();
  const [client, setClient] = useState<ClientFilterValue>('all');
  const companyIds = useMemo(() => companies.map((company) => company.id), [companies]);

  const reviews = useAsync(
    () => myReviewsService.listAcrossClients(companies),
    [companyIds.join('|')],
    { queryKey: queryKeys.myReviews(companyIds) },
  );

  const rows = useMemo<QueueTask[]>(() => reviews.data?.tasks ?? [], [reviews.data]);
  const visible = useMemo(() => (client === 'all' ? rows : rows.filter((task) => task.clientId === client)), [client, rows]);

  const clientOptions = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((task) => counts.set(task.clientId, (counts.get(task.clientId) ?? 0) + 1));
    return companies.map((company) => ({ id: company.id, name: company.name, count: counts.get(company.id) ?? 0 }));
  }, [companies, rows]);

  if (reviews.loading) return <><PageHeader title="Approval queue" subtitle={SUBTITLE} /><ListSkeleton rows={4} /></>;
  if (reviews.error) return <><PageHeader title="Approval queue" subtitle={SUBTITLE} /><ErrorState message={reviews.error} onRetry={reviews.refetch} /></>;

  const failed = reviews.data?.unavailableClients ?? [];
  const nothingLoaded = failed.length > 0 && failed.length === companies.length;

  return (
    <>
      <PageHeader
        title="Approval queue"
        subtitle={SUBTITLE}
        action={<ButtonLink to={appRoutes.tasks} variant="secondary" size="sm">All tasks</ButtonLink>}
      />

      {nothingLoaded ? (
        <ErrorState message={reviews.data?.failure ?? 'Your queue could not be loaded for any client.'} onRetry={reviews.refetch} />
      ) : (
        <>
          {failed.length ? (
            <div className="error-box notice-row" role="alert">
              <span>Could not load the queue for {failed.join(', ')}. Everything else is up to date.</span>
              <Button variant="secondary" size="sm" onClick={reviews.refetch}>Try again</Button>
            </div>
          ) : null}

          {rows.length > 0 && companies.length > 1 ? (
            <ClientFilter options={clientOptions} value={client} total={rows.length} onChange={setClient} />
          ) : null}

          <ApprovalQueueList
            rows={visible}
            refreshing={reviews.refreshing}
            showClient={client === 'all' && companies.length > 1}
            emptyTitle={rows.length === 0 ? 'Nothing waiting on you' : 'Nothing waiting on you for this client'}
            emptyDescription={rows.length === 0 ? 'When somebody submits a task for your review it appears here, oldest first, whichever client it belongs to.' : 'Pick another client, or All clients.'}
            emptyAction={rows.length === 0 ? <ButtonLink to={appRoutes.myWork} variant="secondary" size="sm">Open my work</ButtonLink> : undefined}
          />
        </>
      )}
    </>
  );
}
