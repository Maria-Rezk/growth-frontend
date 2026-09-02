import type { ReactNode } from 'react';
import { useCompany } from '@/context/CompanyContext';
import { getActiveRoles, hasPermission, type Permission } from '@/utils/permissions';

export function RoleGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { activeCompanyId, memberships } = useCompany();
  const roles = getActiveRoles(memberships, activeCompanyId);
  return hasPermission(roles, permission) ? <>{children}</> : <>{fallback}</>;
}
