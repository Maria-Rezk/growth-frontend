import type { ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';
import type { Permission } from '@/utils/permissions';

/** Renders `children` when the signed-in person may do `permission` on this client (platform admins always may). */
export function RoleGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return usePermission(permission) ? <>{children}</> : <>{fallback}</>;
}
