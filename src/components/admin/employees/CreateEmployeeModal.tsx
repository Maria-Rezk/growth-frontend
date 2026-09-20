/* CreateEmployeeModal: split out of EmployeesPage (566 lines); behaviour unchanged. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useIsSuperAdmin } from '@/components/layout/RequireAdmin';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { usersService } from '@/services/users';
import { PlatformRole, type Employee } from '@/types/domain';
import { humanize } from '@/utils/format';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
  platformRole: z.enum(['USER', 'AGENCY_ADMIN', 'SUPER_ADMIN']),
});

type CreateEmployeeForm = z.infer<typeof createEmployeeSchema>;

export function CreateEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const superAdmin = useIsSuperAdmin();
  const form = useForm<CreateEmployeeForm>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { fullName: '', email: '', password: '', platformRole: PlatformRole.USER },
    mode: 'onBlur',
  });

  const create = useMutation(usersService.create, {
    invalidateKeys: [queryKeys.employees, ADMIN_DASHBOARD_KEY],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    /*
      An Admin can create people but not grant admin rights — that capability
      is Super Admin only. Rather than send a role an Admin is not allowed to
      choose, the field is omitted for them and the server applies its USER
      default.
    */
    const created = await create.mutate(superAdmin ? values : { ...values, platformRole: undefined });
    if (created) {
      toast.success('Employee created.');
      close();
    }
  });

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  return (
    <Modal
      open={open}
      onClose={cancel}
      title="Add employee"
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
          <Button form="create-employee-form" type="submit" loading={form.formState.isSubmitting || create.loading}>
            Create employee
          </Button>
        </>
      )}
    >
      <form id="create-employee-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Full name" htmlFor="employee-name" error={form.formState.errors.fullName?.message}>
          <Input id="employee-name" autoComplete="name" autoFocus aria-invalid={Boolean(form.formState.errors.fullName)} {...form.register('fullName')} />
        </Field>
        <Field label="Email" htmlFor="employee-email" error={form.formState.errors.email?.message}>
          <Input id="employee-email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
        </Field>
        <Field label="Temporary password" htmlFor="employee-password" hint="At least 12 characters. Share it securely." error={form.formState.errors.password?.message}>
          <Input id="employee-password" type="password" autoComplete="new-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
        </Field>
        {superAdmin ? (
          <Field label="Platform role" htmlFor="employee-role" error={form.formState.errors.platformRole?.message}>
            <Select id="employee-role" {...form.register('platformRole')}>
              {Object.values(PlatformRole).map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
            </Select>
          </Field>
        ) : (
          <p className="muted">New accounts are created as employees. Only a Super Admin can grant admin access.</p>
        )}
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}

/**
 * Name, status and password reset.
 *
 * `platformRole` is deliberately absent — it moved to its own Super-Admin-only
 * route, and because the API rejects unknown body fields, leaving it in this
 * form would turn every employee edit into a 400.
 */
