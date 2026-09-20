/* PlatformRoleModal: split out of EmployeesPage (566 lines); behaviour unchanged. */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import { useMutation } from '@/hooks/useAsync';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { usersService } from '@/services/users';
import { PlatformRole, type Employee } from '@/types/domain';
import { humanize } from '@/utils/format';

const ROLE_CONSEQUENCES: Record<string, string> = {
  [PlatformRole.USER]: 'Sees only the clients they are assigned to. No admin area.',
  [PlatformRole.AGENCY_ADMIN]:
    'Sees the operations dashboard and every client. Can add clients, rename them, archive them and assign people.',
  [PlatformRole.SUPER_ADMIN]:
    'Everything an Admin can do, plus assigning platform roles and permanently deleting a client — and everything under it — from the database.',
};

/**
 * Assign a platform role. Super Admin only, and never on your own row.
 *
 * The server guards two cases with their own copy: demoting yourself, and
 * demoting the last Super Admin. Both surface here as the server's message
 * rather than a generic failure toast.
 */
export function PlatformRoleModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { user } = useAuth();
  const [role, setRole] = useState<PlatformRole>(PlatformRole.USER);
  const [touched, setTouched] = useState(false);

  const currentRole = employee?.platformRole ?? PlatformRole.USER;
  const selected = touched ? role : currentRole;
  const isSelf = Boolean(employee && user && employee.id === user.id);

  const update = useMutation(usersService.updatePlatformRole, {
    invalidateKeys: [queryKeys.employees, ADMIN_DASHBOARD_KEY],
  });

  const close = () => {
    setTouched(false);
    update.reset();
    onClose();
  };

  const submit = async () => {
    if (!employee || isSelf || selected === currentRole) return;
    const updated = await update.mutate(employee.id, selected);
    if (updated) {
      toast.success(`${employee.fullName ?? employee.email} is now ${humanize(selected)}.`);
      close();
    }
  };

  return (
    <Modal
      open={Boolean(employee)}
      onClose={close}
      title={`Platform role — ${employee?.fullName ?? employee?.email ?? ''}`}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
          <Button
            type="button"
            loading={update.loading}
            disabled={isSelf || selected === currentRole}
            onClick={() => void submit()}
          >
            Change role
          </Button>
        </>
      )}
    >
      <div className="form-grid">
        {isSelf ? (
          <p className="error-box" role="alert">You cannot change your own role.</p>
        ) : null}

        <Field label="Platform role" htmlFor="platform-role">
          <Select
            id="platform-role"
            value={selected}
            disabled={isSelf}
            onChange={(event) => {
              setTouched(true);
              setRole(event.target.value as PlatformRole);
            }}
          >
            {Object.values(PlatformRole).map((value) => (
              <option key={value} value={value}>{humanize(value)}</option>
            ))}
          </Select>
        </Field>

        <p className="muted">{ROLE_CONSEQUENCES[selected]}</p>

        <p className="muted">
          The new role reaches them only when their token is re-issued, so their screen may show the old
          capabilities for a short while.
        </p>

        {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
      </div>
    </Modal>
  );
}
