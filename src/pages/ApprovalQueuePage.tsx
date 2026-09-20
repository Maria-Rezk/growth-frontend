import { ApprovalQueue } from '@/components/domain/ApprovalQueue';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Card';
import { appRoutes } from '@/config/appRoutes';
import { useCompany } from '@/context/CompanyContext';

/**
 * The approval queue — what is waiting on *me*, for the active client.
 *
 * Goes through <RequireCompany> because the endpoint is per client. Somebody
 * who approves on several clients switches client in the topbar to see each
 * queue; a single cross-client view is a backend follow-up, not a fan-out.
 */
export function ApprovalQueuePage() {
  const { activeCompany } = useCompany();
  return (
    <RequireCompany>
      {(companyId) => (
        <>
          <PageHeader
            title="Approval queue"
            subtitle={
              activeCompany
                ? `Tasks on ${activeCompany.name} submitted to you for review, oldest first. Switch client to see another queue.`
                : 'Tasks submitted to you for review, oldest first.'
            }
            action={<ButtonLink to={appRoutes.tasks} variant="secondary" size="sm">All tasks</ButtonLink>}
          />
          <ApprovalQueue companyId={companyId} />
        </>
      )}
    </RequireCompany>
  );
}
