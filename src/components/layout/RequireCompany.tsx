import { Navigate } from 'react-router-dom';
import { useCompany } from '@/context/CompanyContext';
import { ErrorState, LoadingState } from '@/components/ui/State';

export function RequireCompany({ children }: { children: (companyId: string) => React.ReactNode }) {
  const { activeCompanyId, companies, loading, error, refreshCompanies } = useCompany();

  if (loading) return <LoadingState label="Loading workspace…" />;
  if (error) return <ErrorState message={error} onRetry={refreshCompanies} />;

  // Authenticated but no workspace yet → guide them to create one.
  if (!activeCompanyId || companies.length === 0) {
    return <Navigate to="/create-company" replace />;
  }

  return <>{children(activeCompanyId)}</>;
}