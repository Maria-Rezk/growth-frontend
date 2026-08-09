import { useCompany } from '@/context/CompanyContext';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';

export function RequireCompany({ children }: { children: (companyId: string) => React.ReactNode }) {
  const { activeCompanyId, companies, loading, error, refreshCompanies } = useCompany();

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

  return <>{children(activeCompanyId)}</>;
}