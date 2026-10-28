import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { useClientView } from '@/hooks/useClientView';
import { appRoutes } from '@/config/appRoutes';
import { ErrorState, LoadingState } from '@/components/ui/State';
import { NoClientAssigned } from '@/components/layout/RequireCompany';
import { isPlatformAdmin } from '@/types/domain';

/**
 * Agency-only pages. A client-side user who types `/leads` lands on their
 * Home, and the page never mounts — nothing is fetched on their behalf. That
 * holds while the memberships are still loading too: the guard waits instead
 * of rendering the page in the meantime.
 * Cosmetic, as every guard here is: the API enforces the real rule.
 */
export function AgencyRoute() {
  const { isClient, ready } = useClientView();
  if (!ready) return <LoadingState label="Loading clients…" />;
  if (isClient) return <Navigate to={appRoutes.clientHome} replace />;
  return <Outlet />;
}

/**
 * The landing route: clients go Home, staff go to My work.
 *
 * Somebody with no client yet gets an explanation instead of a blank page —
 * or, as a platform admin, the operations dashboard, which needs no client.
 */
export function LandingRedirect() {
  const { user } = useAuth();
  const { error, refreshCompanies } = useCompany();
  const { isClient, ready, hasCompany } = useClientView();
  if (!ready) return <LoadingState label="Loading clients…" />;
  if (!hasCompany) {
    if (isPlatformAdmin(user?.platformRole)) return <Navigate to={appRoutes.adminDashboard} replace />;
    if (error) return <ErrorState message={error} onRetry={refreshCompanies} />;
    return <NoClientAssigned />;
  }
  return <Navigate to={isClient ? appRoutes.clientHome : appRoutes.myWork} replace />;
}
