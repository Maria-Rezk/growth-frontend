import { PlatformRole, type Employee } from '@/types/domain';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export const employeeStatus = (employee: Pick<Employee, 'status'>): EmployeeStatus =>
  (employee.status as EmployeeStatus | undefined) ?? 'ACTIVE';

/**
 * True when the status action (Deactivate / Activate) is not offered at all on
 * this row — the release guide (1.5) says to hide it, not disable it:
 * - on the signed-in person's own row;
 * - on a Super Admin's row when the viewer is not a Super Admin (an Agency
 *   Admin may not change anything on a Super Admin account).
 *
 * Hiding is cosmetic: the API answers 403 for both regardless.
 */
export function hidesStatusAction(
  target: Employee,
  context: { viewerId: string | null | undefined; viewerIsSuperAdmin: boolean },
): boolean {
  if (context.viewerId && target.id === context.viewerId) return true;
  return target.platformRole === PlatformRole.SUPER_ADMIN && !context.viewerIsSuperAdmin;
}

/** What the Employees page offers on one row. Every flag is visibility only — the API stays the authority. */
export interface EmployeeActionVisibility {
  /** The Edit dialog: name and password reset. */
  edit: boolean;
  /** The Status field inside the Edit dialog. Same rule as the row's status action, plus its blocks. */
  editStatus: boolean;
  /** The row's Deactivate / Activate button. */
  statusAction: boolean;
}

/**
 * The one place the Employees page decides which actions a row shows (guide 1.5).
 *
 * - An Agency Admin may change nothing on a Super Admin account — status,
 *   password or name — so Edit and the status action are both hidden there.
 * - Nobody is offered their own status: not on the row, not inside Edit.
 * - Inside Edit, status is also left out when deactivation is blocked (the
 *   last active Super Admin), so the dialog is never a way round the row's guard.
 */
export function employeeActionVisibility(
  target: Employee,
  context: { viewerId: string | null | undefined; viewerIsSuperAdmin: boolean; employees: readonly Employee[] },
): EmployeeActionVisibility {
  const protectedAccount = target.platformRole === PlatformRole.SUPER_ADMIN && !context.viewerIsSuperAdmin;
  const statusAction = !hidesStatusAction(target, context);
  return {
    edit: !protectedAccount,
    statusAction,
    editStatus: !protectedAccount && statusAction && deactivationBlockReason(target, context) === null,
  };
}

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
