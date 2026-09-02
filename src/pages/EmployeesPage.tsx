import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireAdmin, useIsSuperAdmin } from '@/components/layout/RequireAdmin';
import { PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { companiesService } from '@/services/companies';
import { usersService } from '@/services/users';
import { CompanyMembershipRole, PlatformRole, type Employee } from '@/types/domain';
import { RoleChecklist } from '@/components/domain/RoleChecklist';
import { membershipRoles, rolesLabel } from '@/utils/roles';
import { humanize } from '@/utils/format';
import { sortByName } from '@/utils/sort';

export function EmployeesPage() {
  return (
    <RequireAdmin>
      <EmployeesInner />
    </RequireAdmin>
  );
}

function EmployeesInner() {
  const employees = useAsync(() => usersService.list(), [], { queryKey: queryKeys.employees });
  const superAdmin = useIsSuperAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [assignTarget, setAssignTarget] = useState<Employee | null>(null);
  const [roleTarget, setRoleTarget] = useState<Employee | null>(null);

  const columns = useMemo<Column<Employee>[]>(() => [
    {
      key: 'employee',
      header: 'Employee',
      sortValue: (employee) => employee.fullName ?? employee.email,
      render: (employee) => (
        <div>
          <strong>{employee.fullName ?? employee.email}</strong>
          <p className="muted">{employee.email}</p>
        </div>
      ),
    },
    {
      key: 'platformRole',
      header: 'Platform role',
      sortValue: (employee) => employee.platformRole ?? '',
      render: (employee) => (
        <Badge tone={employee.platformRole === PlatformRole.USER ? 'neutral' : 'accent'}>
          {humanize(employee.platformRole)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (employee) => (
        <Badge tone={employee.status === 'ACTIVE' ? 'success' : 'warning'}>{humanize(employee.status ?? 'ACTIVE')}</Badge>
      ),
    },
    {
      key: 'clients',
      header: 'Clients',
      render: (employee) => employee.clients.length
        ? (
          <div className="badge-row">
            {sortByName(employee.clients, (client) => client.companyName).map((client) => (
              <Badge key={client.membershipId} tone="neutral">{client.companyName} · {rolesLabel(client)}</Badge>
            ))}
          </div>
        )
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
          {/*
            Assigning platform roles is Super Admin only. It is kept out of the
            edit form entirely — it is a different kind of decision, and the API
            has moved it to its own route.
          */}
          {superAdmin ? (
            <Button variant="ghost" size="sm" onClick={() => setRoleTarget(employee)}>Role…</Button>
          ) : null}
        </div>
      ),
    },
  ], [superAdmin]);

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Create employee accounts, reset access and assign them to clients."
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
        pageSize={20}
        defaultSortKey="employee"
      />

      <CreateEmployeeModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditEmployeeModal employee={editTarget} onClose={() => setEditTarget(null)} />
      <AssignClientModal employee={assignTarget} onClose={() => setAssignTarget(null)} />
      <PlatformRoleModal employee={roleTarget} onClose={() => setRoleTarget(null)} />
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
const editEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  password: z.union([z.string().length(0), z.string().min(12, 'Password must be at least 12 characters.')]).optional(),
});

type EditEmployeeForm = z.infer<typeof editEmployeeSchema>;

function EditEmployeeModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
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
function PlatformRoleModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
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

const assignClientSchema = z.object({
  companyId: z.string().min(1, 'Choose a client.'),
  // Empty is a 400 from the API — a member with no role has no permissions.
  roles: z.array(z.nativeEnum(CompanyMembershipRole)).min(1, 'Pick at least one role.'),
});

type AssignClientForm = z.infer<typeof assignClientSchema>;

/**
 * Put an employee on a client, or change what they do on one they already work
 * on.
 *
 * Both live here because from this screen they are one intent — "Jessica should
 * also design for Shahba Bank" — even though they are different calls. Adding
 * somebody already active on a client is a 409, so an existing client is a
 * PATCH of their membership rather than a second one.
 */
function AssignClientModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const companies = useAsync(() => companiesService.list(), [], { queryKey: queryKeys.companies, enabled: Boolean(employee) });

  /*
    Every client is offered, split by whether they already work there. Hiding
    the ones they are on was right when a person could hold one role per client;
    now it hides the only route to a second role.
  */
  const existingByCompany = useMemo(
    () => new Map((employee?.clients ?? []).map((client) => [client.companyId, client])),
    [employee],
  );

  const { fresh, joined } = useMemo(() => {
    const all = companies.data ?? [];
    return {
      fresh: all.filter((company) => !existingByCompany.has(company.id)),
      joined: all.filter((company) => existingByCompany.has(company.id)),
    };
  }, [companies.data, existingByCompany]);

  const form = useForm<AssignClientForm>({
    resolver: zodResolver(assignClientSchema),
    defaultValues: { companyId: '', roles: [CompanyMembershipRole.DESIGNER] },
    mode: 'onBlur',
  });

  const companyId = form.watch('companyId');
  const existing = existingByCompany.get(companyId);

  /*
    Saving replaces the whole set, so picking a client they already work on has
    to start from what they hold there — otherwise "add Designer" would quietly
    drop Copywriter.
  */
  useEffect(() => {
    if (!companyId) return;
    form.setValue(
      'roles',
      existing ? membershipRoles(existing) : [CompanyMembershipRole.DESIGNER],
      { shouldValidate: true },
    );
  }, [companyId, existing, form]);

  const invalidateKeys = [queryKeys.employees, ADMIN_DASHBOARD_KEY];

  const assign = useMutation(companiesService.addMember, {
    invalidateKeys,
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const update = useMutation(companiesService.updateMember, {
    invalidateKeys,
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    if (!employee) return;

    const saved = existing
      ? await update.mutate(values.companyId, existing.membershipId, { roles: values.roles })
      : await assign.mutate(values.companyId, { userId: employee.id, roles: values.roles });

    if (saved) {
      toast.success(existing ? 'Roles updated.' : 'Employee assigned to client.');
      close();
    }
  });

  const close = () => {
    form.reset();
    assign.reset();
    update.reset();
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
          <Button
            form="assign-client-form"
            type="submit"
            loading={form.formState.isSubmitting || assign.loading || update.loading}
            // Blocked here rather than letting the 400 teach the rule.
            disabled={!companies.data?.length || form.watch('roles').length === 0}
          >
            {existing ? 'Save roles' : 'Assign'}
          </Button>
        </>
      )}
    >
      <form id="assign-client-form" className="form-grid" onSubmit={submit} noValidate>
        {companies.data?.length ? (
          <>
            <Field label="Client" htmlFor="assign-client" error={form.formState.errors.companyId?.message}>
              <Select id="assign-client" {...form.register('companyId')}>
                <option value="">Select a client</option>
                {/* Grouped so it reads as a valid choice to pick a client they
                    already work on, and says what picking it will do. */}
                {fresh.length ? (
                  <optgroup label="Not on this client yet">
                    {fresh.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </optgroup>
                ) : null}
                {joined.length ? (
                  <optgroup label="Already works on — change their roles">
                    {joined.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name} · {rolesLabel(existingByCompany.get(company.id))}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </Field>
            <Field
              label="Roles on this client"
              htmlFor="assign-roles"
              hint={existing
                ? 'Starts from what they hold today. Saving replaces the set, so leave the roles they keep ticked.'
                : undefined}
              error={form.formState.errors.roles?.message}
            >
              <RoleChecklist
                value={form.watch('roles')}
                onChange={(roles) => form.setValue('roles', roles, { shouldValidate: true })}
              />
            </Field>
          </>
        ) : (
          <p className="muted">No clients exist yet.</p>
        )}
        {assign.error ? <p className="error-box" role="alert">{assign.error}</p> : null}
        {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
      </form>
    </Modal>
  );
}
