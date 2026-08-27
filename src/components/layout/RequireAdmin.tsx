import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { EmptyState } from '@/components/ui/State';
import { isPlatformAdmin, isSuperAdmin } from '@/types/domain';

/**
 * In-page gate: renders an explanation instead of the section.
 *
 * Use this inside a page that is otherwise reachable. For a whole route, use
 * `AdminRoute` below — a user who typed the URL should be sent away, not shown
 * a page frame around a refusal.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!isPlatformAdmin(user?.platformRole)) {
    return (
      <EmptyState
        title="Not authorized"
        description="This section is limited to platform administrators."
      />
    );
  }

  return <>{children}</>;
}

/**
 * Route guard for `/admin/*`. Non-admins are redirected, and — importantly —
 * the admin pages never mount, so nothing fetches.
 *
 * This is cosmetic, exactly like every other role check in the frontend: the
 * API enforces the real rule and answers 403. It exists so a USER cannot reach
 * an admin screen by typing the URL, not as security.
 */
export function AdminRoute() {
  const { user } = useAuth();
  if (!isPlatformAdmin(user?.platformRole)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Renders `children` only for a Super Admin. Used for the three capabilities
 * an Admin does not have: assigning platform roles, deleting a client from the
 * database, and the system health strip.
 */
export function SuperAdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { user } = useAuth();
  return <>{isSuperAdmin(user?.platformRole) ? children : fallback}</>;
}

/** `true` when the signed-in user is a Super Admin. For non-JSX branches. */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return isSuperAdmin(user?.platformRole);
}
