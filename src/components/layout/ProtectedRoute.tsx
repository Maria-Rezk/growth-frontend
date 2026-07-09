import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import { LoadingState } from '@/components/ui/State';

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (env.demoMode) return <Outlet />;
  if (loading) return <main className="auth-shell"><LoadingState label="Restoring session…" /></main>;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
