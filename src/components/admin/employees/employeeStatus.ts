import { PlatformRole, type Employee } from '@/types/domain';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export const employeeStatus = (employee: Pick<Employee, 'status'>): EmployeeStatus =>
  (employee.status as EmployeeStatus | undefined) ?? 'ACTIVE';

/**
 * Why the Deactivate action is unavailable for this employee, or `null` when
 * it may be offered.
 *
 * These are UI guards, not the authority: the API still decides. They exist so
 * an admin is not offered an action that would lock the platform (or
 * themselves) out, and so the reason is stated instead of a bare 403.
 */
export function deactivationBlockReason(
  target: Employee,
  context: { viewerId: string | null | undefined; viewerIsSuperAdmin: boolean; employees: readonly Employee[] },
): string | null {
  if (context.viewerId && target.id === context.viewerId) {
    return 'You cannot deactivate your own account.';
  }
  if (target.platformRole === PlatformRole.SUPER_ADMIN) {
    if (!context.viewerIsSuperAdmin) return 'Only a Super Admin can deactivate a Super Admin.';
    const activeSuperAdmins = context.employees.filter(
      (employee) => employee.platformRole === PlatformRole.SUPER_ADMIN && employeeStatus(employee) === 'ACTIVE',
    );
    if (activeSuperAdmins.length <= 1) return 'This is the only active Super Admin — promote someone else first.';
  }
  return null;
}
