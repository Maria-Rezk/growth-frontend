import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useMutation } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/http';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { usersService } from '@/services/users';
import type { Employee } from '@/types/domain';
import { HeldReviewsNotice } from '@/components/admin/employees/HeldReviewsNotice';
import { employeeStatus } from '@/components/admin/employees/employeeStatus';

/**
 * Deactivate / Activate for one employee row (FG-07).
 *
 * Deactivating is a status change — `PATCH /users/:id { status: 'INACTIVE' }`
 * — not a deletion: the account, its memberships and its history stay, and
 * Activate restores access. It is deliberately never labelled "Delete".
 *
 * `blockedReason` comes from `deactivationBlockReason` (self, last Super
 * Admin, Admin acting on a Super Admin); when set the button is disabled and
 * the reason is shown as its description.
 */
export function EmployeeStatusAction({ employee, blockedReason }: { employee: Employee; blockedReason: string | null }) {
  const confirm = useConfirm();
  const update = useMutation(usersService.update, {
    invalidateKeys: [queryKeys.employees, ADMIN_DASHBOARD_KEY],
    onError: (error) => {
      // The table row has no room for an inline error; the server's message
      // (e.g. a policy refusal) is surfaced as-is.
      toast.error(errorMessage(error));
    },
  });

  const name = employee.fullName ?? employee.email;
  const active = employeeStatus(employee) === 'ACTIVE';
  const reasonId = `employee-status-reason-${employee.id}`;

  const deactivate = async () => {
    const ok = await confirm({
      title: 'Deactivate employee',
      message: (
        <div className="detail-stack">
          <p>
            Deactivate <strong>{name}</strong>? They are signed out and cannot sign in until reactivated. Their
            account, client assignments and history are kept — this is not a deletion.
          </p>
          <HeldReviewsNotice userId={employee.id} />
        </div>
      ),
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    const updated = await update.mutate(employee.id, { status: 'INACTIVE' });
    if (updated) toast.success(`${name} deactivated.`);
  };

  // Restoring access needs no guard — the same rule MembersPage applies to Reactivate.
  const activate = async () => {
    const updated = await update.mutate(employee.id, { status: 'ACTIVE' });
    if (updated) toast.success(`${name} reactivated.`);
  };

  if (!active) {
    return (
      <Button variant="secondary" size="sm" loading={update.loading} aria-label={`Activate ${name}`} onClick={() => void activate()}>
        Activate
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        loading={update.loading}
        disabled={Boolean(blockedReason)}
        aria-label={`Deactivate ${name}`}
        aria-describedby={blockedReason ? reasonId : undefined}
        title={blockedReason ?? undefined}
        onClick={() => void deactivate()}
      >
        Deactivate
      </Button>
      {blockedReason ? <span id={reasonId} className="sr-only">{blockedReason}</span> : null}
    </>
  );
}
