import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import { LoadingState } from '@/components/ui/State';

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Demo mode starts signed in and never restores a session, so there is no
  // loading state, but signing out must still lead to the login screen.
  if (loading && !env.demoMode) return <main className="auth-shell"><LoadingState label="Restoring session…" /></main>;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
