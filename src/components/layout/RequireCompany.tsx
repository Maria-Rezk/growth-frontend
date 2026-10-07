import { Fragment } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { Button } from '@/components/ui/Button';
import { isPlatformAdmin } from '@/types/domain';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';

export function RequireCompany({ children }: { children: (companyId: string) => React.ReactNode }) {
  const { user } = useAuth();
  const { activeCompanyId, companies, loading, error, refreshCompanies, refreshMemberships, rolesUnavailable } = useCompany();

  if (loading) return <LoadingState label="Loading clients…" />;
  if (error) return <ErrorState message={error} onRetry={refreshCompanies} />;

  // Employees never create clients — an admin assigns them to one. An empty
  // list just means nobody has done that yet, not a broken state.
  if (!activeCompanyId || companies.length === 0) {
    return (
      <EmptyState
        title="No client assigned yet"
        description="You are not assigned to any client yet — ask your manager."
      />
    );
  }

  return (
    <>
      {/* Without the person's roles every role-gated control is hidden. Say so, rather than leave a page that looks empty. */}
      {rolesUnavailable && !isPlatformAdmin(user?.platformRole) ? (
        <div className="review-note notice-row" role="status">
          <span>We could not confirm your role on this client, so some actions are hidden.</span>
          <Button size="sm" variant="secondary" onClick={() => void refreshMemberships()}>Try again</Button>
        </div>
      ) : null}
      {/* Keyed by client: everything a page holds in local state (an open dialog, a selected record, a half-typed form) belongs to one client and is dropped when the person switches. */}
      <Fragment key={activeCompanyId}>{children(activeCompanyId)}</Fragment>
    </>
  );
}