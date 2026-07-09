import type { ReactNode } from 'react';
import { useCompany } from '@/context/CompanyContext';
import { getActiveRole, hasPermission, type Permission } from '@/utils/permissions';

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
  const role = getActiveRole(memberships, activeCompanyId);
  return hasPermission(role, permission) ? <>{children}</> : <>{fallback}</>;
}
