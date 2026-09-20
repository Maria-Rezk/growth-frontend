import { Navigate, Outlet } from 'react-router-dom';
import { useClientView } from '@/hooks/useClientView';
import { appRoutes } from '@/config/appRoutes';

/**
 * Agency-only pages. A client-side user who types `/leads` lands on their
 * Home, and the page never mounts — nothing is fetched on their behalf.
 * Cosmetic, as every guard here is: the API enforces the real rule.
 */
export function AgencyRoute() {
  const { isClient, ready } = useClientView();
  if (!ready) return <Outlet />;
  if (isClient) return <Navigate to={appRoutes.clientHome} replace />;
  return <Outlet />;
}

/** The landing route: clients go Home, staff go to My work. */
export function LandingRedirect() {
  const { isClient, ready } = useClientView();
  if (!ready) return null;
  return <Navigate to={isClient ? appRoutes.clientHome : appRoutes.myWork} replace />;
}
