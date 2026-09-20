import { useMemo, useState } from 'react';
import { RequireAdmin, useIsSuperAdmin } from '@/components/layout/RequireAdmin';
import { PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { usersService } from '@/services/users';
import { PlatformRole, type Employee } from '@/types/domain';
import { rolesLabel } from '@/utils/roles';
import { humanize } from '@/utils/format';
import { sortByName } from '@/utils/sort';
import { CreateEmployeeModal } from '@/components/admin/employees/CreateEmployeeModal';
import { EditEmployeeModal } from '@/components/admin/employees/EditEmployeeModal';
import { PlatformRoleModal } from '@/components/admin/employees/PlatformRoleModal';
import { AssignClientModal } from '@/components/admin/employees/AssignClientModal';

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
