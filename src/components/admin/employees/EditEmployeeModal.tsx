/* EditEmployeeModal: split out of EmployeesPage (566 lines); behaviour unchanged. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { usersService } from '@/services/users';
import { type Employee } from '@/types/domain';
import { humanize } from '@/utils/format';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

const editEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  password: z.union([z.string().length(0), z.string().min(12, 'Password must be at least 12 characters.')]).optional(),
});

type EditEmployeeForm = z.infer<typeof editEmployeeSchema>;

export function EditEmployeeModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const form = useForm<EditEmployeeForm>({
    resolver: zodResolver(editEmployeeSchema),
    values: employee
      ? {
        fullName: employee.fullName ?? '',
        status: (employee.status as EditEmployeeForm['status']) ?? 'ACTIVE',
        password: '',
      }
      : undefined,
    mode: 'onBlur',
  });

  const update = useMutation(usersService.update, {
    invalidateKeys: [queryKeys.employees, ADMIN_DASHBOARD_KEY],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    if (!employee) return;
    const updated = await update.mutate(employee.id, {
      fullName: values.fullName.trim(),
      status: values.status,
      password: values.password ? values.password : undefined,
    });
    if (updated) {
      toast.success('Employee updated.');
      close();
    }
  });

  const close = () => {
    form.reset();
    update.reset();
    onClose();
  };
  const discard = useDiscardGuard(form, Boolean(employee));
  const cancel = discard(close);

  return (
    <Modal
      open={Boolean(employee)}
      onClose={cancel}
      title={`Edit ${employee?.fullName ?? employee?.email ?? 'employee'}`}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
          <Button form="edit-employee-form" type="submit" loading={form.formState.isSubmitting || update.loading}>
            Save changes
          </Button>
        </>
      )}
    >
      <form id="edit-employee-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Full name" htmlFor="edit-employee-name" error={form.formState.errors.fullName?.message}>
          <Input id="edit-employee-name" autoComplete="name" aria-invalid={Boolean(form.formState.errors.fullName)} {...form.register('fullName')} />
        </Field>
        <Field
          label="Status"
          htmlFor="edit-employee-status"
          hint="Setting status to anything other than Active ends the employee's session immediately."
          error={form.formState.errors.status?.message}
        >
          <Select id="edit-employee-status" {...form.register('status')}>
            {['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
          </Select>
        </Field>
        <Field
          label="New password"
          htmlFor="edit-employee-password"
          hint="Leave blank to keep the current password. Setting one ends the employee's session immediately."
          error={form.formState.errors.password?.message}
        >
          <Input id="edit-employee-password" type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <p className="muted">
          Platform role is changed separately, from the Role control — it is a Super Admin decision.
        </p>
        {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
      </form>
    </Modal>
  );
}

/** What each role can do, stated plainly before someone is promoted into it. */
