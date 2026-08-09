import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireAdmin } from '@/components/layout/RequireAdmin';
import { PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { companiesService } from '@/services/companies';
import { usersService } from '@/services/users';
import { queryKeys } from '@/lib/queryClient';
import { CompanyMembershipRole, PlatformRole, type Employee } from '@/types/domain';
import { humanize } from '@/utils/format';

export function EmployeesPage() {
  return (
    <RequireAdmin>
      <EmployeesInner />
    </RequireAdmin>
  );
}

function EmployeesInner() {
  const employees = useAsync(() => usersService.list(), [], { queryKey: queryKeys.employees });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [assignTarget, setAssignTarget] = useState<Employee | null>(null);

  const columns = useMemo<Column<Employee>[]>(() => [
    {
      key: 'employee',
      header: 'Employee',
      render: (employee) => (
        <div>
          <strong>{employee.fullName ?? employee.email}</strong>
          <p className="muted">{employee.email}</p>
        </div>
      ),
    },
    { key: 'platformRole', header: 'Platform role', render: (employee) => <Badge>{humanize(employee.platformRole)}</Badge> },
    { key: 'status', header: 'Status', render: (employee) => <Badge tone={employee.status === 'ACTIVE' ? 'success' : 'warning'}>{humanize(employee.status ?? 'ACTIVE')}</Badge> },
    {
      key: 'clients',
      header: 'Clients',
      render: (employee) => employee.clients.length
        ? <div className="badge-row">{employee.clients.map((client) => <Badge key={client.membershipId} tone="neutral">{client.companyName} · {humanize(client.role)}</Badge>)}</div>
        : <span className="muted">None yet</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'cell-right',
      render: (employee) => (
        <div className="button-row">
          <Button variant="secondary" size="sm" onClick={() => setEditTarget(employee)}>Edit</Button>
          <Button variant="secondary" size="sm" onClick={() => setAssignTarget(employee)}>Assign to client</Button>
        </div>
      ),
    },
  ], []);

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Create employee accounts and manage platform roles and access."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}>Add employee</Button>}
      />

      <DataTable
        columns={columns}
        rows={employees.data ?? []}
        rowKey={(employee) => employee.id}
        loading={employees.loading}
        error={employees.error}
        onRetry={employees.refetch}
        emptyTitle="No employees yet"
      />

      <CreateEmployeeModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditEmployeeModal employee={editTarget} onClose={() => setEditTarget(null)} />
      <AssignClientModal employee={assignTarget} onClose={() => setAssignTarget(null)} />
    </>
  );
}

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
  platformRole: z.enum(['USER', 'AGENCY_ADMIN', 'SUPER_ADMIN']),
});

type CreateEmployeeForm = z.infer<typeof createEmployeeSchema>;

function CreateEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const form = useForm<CreateEmployeeForm>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { fullName: '', email: '', password: '', platformRole: PlatformRole.USER },
    mode: 'onBlur',
  });

  const create = useMutation(usersService.create, {
    invalidateKeys: [queryKeys.employees],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    const created = await create.mutate(values);
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

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add employee"
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
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
        <Field label="Platform role" htmlFor="employee-role" error={form.formState.errors.platformRole?.message}>
          <Select id="employee-role" {...form.register('platformRole')}>
            {Object.values(PlatformRole).map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
          </Select>
        </Field>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}

const editEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  platformRole: z.enum(['USER', 'AGENCY_ADMIN', 'SUPER_ADMIN']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  password: z.union([z.string().length(0), z.string().min(12, 'Password must be at least 12 characters.')]).optional(),
});

type EditEmployeeForm = z.infer<typeof editEmployeeSchema>;

function EditEmployeeModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const form = useForm<EditEmployeeForm>({
    resolver: zodResolver(editEmployeeSchema),
    values: employee
      ? { fullName: employee.fullName ?? '', platformRole: employee.platformRole ?? PlatformRole.USER, status: (employee.status as EditEmployeeForm['status']) ?? 'ACTIVE', password: '' }
      : undefined,
    mode: 'onBlur',
  });

  const update = useMutation(usersService.update, {
    invalidateKeys: [queryKeys.employees],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    if (!employee) return;
    const updated = await update.mutate(employee.id, {
      fullName: values.fullName.trim(),
      platformRole: values.platformRole,
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

  return (
    <Modal
      open={Boolean(employee)}
      onClose={close}
      title={`Edit ${employee?.fullName ?? employee?.email ?? 'employee'}`}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
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
        <Field label="Platform role" htmlFor="edit-employee-role" error={form.formState.errors.platformRole?.message}>
          <Select id="edit-employee-role" {...form.register('platformRole')}>
            {Object.values(PlatformRole).map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
          </Select>
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
        {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
      </form>
    </Modal>
  );
}

const assignClientSchema = z.object({
  companyId: z.string().min(1, 'Choose a client.'),
  role: z.nativeEnum(CompanyMembershipRole),
});

type AssignClientForm = z.infer<typeof assignClientSchema>;

function AssignClientModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const companies = useAsync(() => companiesService.list(), [], { queryKey: queryKeys.companies, enabled: Boolean(employee) });
  const availableCompanies = useMemo(() => {
    const assignedIds = new Set(employee?.clients.map((client) => client.companyId));
    return (companies.data ?? []).filter((company) => !assignedIds.has(company.id));
  }, [companies.data, employee]);

  const form = useForm<AssignClientForm>({
    resolver: zodResolver(assignClientSchema),
    defaultValues: { companyId: '', role: CompanyMembershipRole.DESIGNER },
    mode: 'onBlur',
  });

  const assign = useMutation(companiesService.addMember, {
    invalidateKeys: [queryKeys.employees],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    if (!employee) return;
    const created = await assign.mutate(values.companyId, { userId: employee.id, role: values.role });
    if (created) {
      toast.success('Employee assigned to client.');
      close();
    }
  });

  const close = () => {
    form.reset();
    assign.reset();
    onClose();
  };

  return (
    <Modal
      open={Boolean(employee)}
      onClose={close}
      title={`Assign ${employee?.fullName ?? employee?.email ?? 'employee'} to a client`}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
          <Button form="assign-client-form" type="submit" loading={form.formState.isSubmitting || assign.loading} disabled={!availableCompanies.length}>
            Assign
          </Button>
        </>
      )}
    >
      <form id="assign-client-form" className="form-grid" onSubmit={submit} noValidate>
        {availableCompanies.length ? (
          <>
            <Field label="Client" htmlFor="assign-client" error={form.formState.errors.companyId?.message}>
              <Select id="assign-client" {...form.register('companyId')}>
                <option value="">Select a client</option>
                {availableCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </Select>
            </Field>
            <Field label="Role on this client" htmlFor="assign-role" error={form.formState.errors.role?.message}>
              <Select id="assign-role" {...form.register('role')}>
                {Object.values(CompanyMembershipRole).map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
              </Select>
            </Field>
          </>
        ) : (
          <p className="muted">Already assigned to every client, or none exist yet.</p>
        )}
        {assign.error ? <p className="error-box" role="alert">{assign.error}</p> : null}
      </form>
    </Modal>
  );
}
