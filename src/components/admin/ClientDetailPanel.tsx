import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { SuperAdminOnly } from '@/components/layout/RequireAdmin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState } from '@/components/ui/State';
import { useCompany } from '@/context/CompanyContext';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { companiesService } from '@/services/companies';
import { usersService } from '@/services/users';
import { humanize } from '@/utils/format';
import { sortByName } from '@/utils/sort';
import { membershipRoles } from '@/utils/roles';
import { RoleChecklist, RolePills } from '@/components/domain/RoleChecklist';
import { CompanyMembershipRole, type Company, type CompanyStatus, type Membership } from '@/types/domain';

const renameSchema = z.object({
  name: z.string().trim().min(2, 'Client name is required.').max(160, 'Client name is too long.'),
});

type RenameForm = z.infer<typeof renameSchema>;

/**
 * Everything an admin does to one client, in one panel: rename, archive, staff
 * it, and — for a Super Admin — delete it.
 *
 * These controls live in the admin area rather than the client workspace on
 * purpose. Renaming and member management are tightening to admin-only on the
 * server; keeping them here means the day that lands, nothing in the workspace
 * starts answering 403.
 */
export function ClientDetailPanel({
  client,
  onClose,
  onRequestDelete,
}: {
  client: Company | null;
  onClose: () => void;
  onRequestDelete: (client: Company) => void;
}) {
  return (
    <Modal open={Boolean(client)} onClose={onClose} title={client?.name ?? 'Client'} wide>
      {client ? <PanelBody client={client} onRequestDelete={onRequestDelete} /> : null}
    </Modal>
  );
}

function PanelBody({ client, onRequestDelete }: { client: Company; onRequestDelete: (client: Company) => void }) {
  const { refreshCompanies } = useCompany();
  const archived = client.status === 'ARCHIVED';

  const renameForm = useForm<RenameForm>({
    resolver: zodResolver(renameSchema),
    values: { name: client.name },
    mode: 'onBlur',
  });

  const update = useMutation(companiesService.update, {
    invalidateKeys: [queryKeys.companies, ADMIN_DASHBOARD_KEY],
    onSuccess: () => { void refreshCompanies(); },
    onError: (error) => applyServerFieldErrors(renameForm, error),
  });

  const rename = renameForm.handleSubmit(async (values) => {
    // Only `name` — any extra key in the body is a 400, not an ignored field.
    const updated = await update.mutate(client.id, { name: values.name.trim() });
    if (updated) toast.success('Client renamed.');
  });

  const setStatus = async (status: CompanyStatus) => {
    const updated = await update.mutate(client.id, { status });
    if (updated) toast.success(status === 'ARCHIVED' ? 'Client archived.' : 'Client restored.');
  };

  return (
    <div className="detail-stack">
      <section className="panel-section">
        <h3>Name</h3>
        <form className="inline-form" onSubmit={rename} noValidate>
          <Field label="Client name" htmlFor="client-rename" error={renameForm.formState.errors.name?.message}>
            <Input
              id="client-rename"
              aria-invalid={Boolean(renameForm.formState.errors.name)}
              {...renameForm.register('name')}
            />
          </Field>
          <Button type="submit" size="sm" loading={update.loading}>Save name</Button>
        </form>
        <p className="muted">
          The name appears in the client switcher, the dashboard filter and every breadcrumb — all of them update from
          the response.
        </p>
      </section>

      <section className="panel-section">
        <h3>Status</h3>
        <div className="button-row">
          <Badge tone={archived ? 'neutral' : 'success'}>{humanize(client.status ?? 'ACTIVE')}</Badge>
          {archived ? (
            <Button variant="secondary" size="sm" loading={update.loading} onClick={() => void setStatus('ACTIVE')}>
              Restore client
            </Button>
          ) : (
            <Button variant="secondary" size="sm" loading={update.loading} onClick={() => void setStatus('ARCHIVED')}>
              Archive client
            </Button>
          )}
        </div>
        <p className="muted">
          Archiving is a status change and is reversible. It is not the same as deleting.
        </p>
        {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
      </section>

      <MembersSection client={client} />

      {/* Danger zone — Super Admin only, visually separated from Archive. */}
      <SuperAdminOnly>
        <section className="panel-section panel-section--danger">
          <h3>Danger zone</h3>
          <p className="muted">
            Deleting removes the client and every task, post, lead, campaign, membership and file under it from the
            database. There is no undo and no archive copy.
          </p>
          <Button variant="danger" size="sm" onClick={() => onRequestDelete(client)}>Delete permanently…</Button>
        </section>
      </SuperAdminOnly>
    </div>
  );
}

const assignSchema = z.object({
  userId: z.string().min(1, 'Choose an employee.'),
  // The API rejects an empty list: a member with no role has no permissions.
  roles: z.array(z.nativeEnum(CompanyMembershipRole)).min(1, 'Pick at least one role.'),
});

type AssignForm = z.infer<typeof assignSchema>;

/**
 * "Assign people" — the current members table plus an employee picker.
 *
 * The picker excludes people who are already active members: one membership
 * per person per client is enforced by a database constraint, so relying on
 * the resulting error instead of filtering would show the user a failure for
 * something the UI could have prevented.
 */
function MembersSection({ client }: { client: Company }) {
  const members = useAsync(() => companiesService.members(client.id), [client.id], {
    queryKey: queryKeys.companyMembers(client.id),
  });
  const employees = useAsync(() => usersService.list(), [], { queryKey: queryKeys.employees });
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Roles read as pills until someone opens the checklist — seven checkboxes
  // on every row is unreadable when you only came to look.
  const [editingId, setEditingId] = useState<string | null>(null);

  const employeeName = useMemo(() => {
    const map = new Map<string, string>();
    (employees.data ?? []).forEach((employee) => map.set(employee.id, employee.fullName ?? employee.email));
    return map;
  }, [employees.data]);

  /*
    Sorted here rather than in the service: the displayed name can come from the
    employees map when the API leaves `user` off the membership, so A→Z has to
    be applied to the label actually shown.
  */
  const activeMembers = useMemo(
    () => sortByName(
      (members.data ?? []).filter((member) => member.status === 'ACTIVE'),
      (member) => member.user?.fullName ?? employeeName.get(member.userId) ?? member.userId,
    ),
    [employeeName, members.data],
  );

  const assignable = useMemo(() => {
    const taken = new Set(activeMembers.map((member) => member.userId));
    return (employees.data ?? []).filter((employee) => !taken.has(employee.id));
  }, [activeMembers, employees.data]);

  const invalidate = [queryKeys.companyMembers(client.id), queryKeys.employees, ADMIN_DASHBOARD_KEY];

  const form = useForm<AssignForm>({
    resolver: zodResolver(assignSchema),
    defaultValues: { userId: '', roles: [CompanyMembershipRole.DESIGNER] },
    mode: 'onBlur',
  });

  const add = useMutation(companiesService.addMember, {
    invalidateKeys: invalidate,
    onError: (error) => applyServerFieldErrors(form, error),
  });
  const changeRole = useMutation(companiesService.updateMember, { invalidateKeys: invalidate });
  const remove = useMutation(companiesService.removeMember, { invalidateKeys: invalidate });

  const submit = form.handleSubmit(async (values) => {
    const created = await add.mutate(client.id, { userId: values.userId, roles: values.roles });
    if (created) {
      toast.success('Employee assigned.');
      // Roles stay ticked: assigning several people to the same job in a row
      // is the common case.
      form.reset({ userId: '', roles: values.roles });
    }
  });

  /*
    `roles` replaces the whole set, so un-ticking the last one cannot be a
    PATCH — the API rejects an empty array, and "holds no roles" is a different
    thing from "no longer works on this client". It routes to DELETE instead.
  */
  const saveRoles = (member: Membership, roles: CompanyMembershipRole[]) => {
    setPendingId(member.id);
    if (roles.length === 0) {
      setEditingId(null);
      void remove.mutate(client.id, member.id).then(() => toast.success('Removed from client.'));
      return;
    }
    void changeRole
      .mutate(client.id, member.id, { roles })
      .then((updated) => { if (updated) toast.success('Roles updated.'); });
  };

  return (
    <section className="panel-section">
      <h3>People on this client</h3>

      {members.loading ? <LoadingState label="Loading members…" /> : null}
      {members.error ? <ErrorState message={members.error} onRetry={members.refetch} /> : null}

      {!members.loading && !members.error ? (
        activeMembers.length === 0 ? (
          <p className="muted">Nobody is assigned yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Roles on this client</th>
                  <th className="cell-right" />
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((member) => (
                  <tr key={member.id}>
                    <td><strong>{member.user?.fullName ?? employeeName.get(member.userId) ?? member.userId}</strong></td>
                    <td>
                      {editingId === member.id ? (
                        <div className="role-editor">
                          <RoleChecklist
                            value={membershipRoles(member)}
                            disabled={changeRole.loading && pendingId === member.id}
                            onChange={(roles) => saveRoles(member, roles)}
                          />
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Done</Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="role-pills-button"
                          aria-label={`Change roles for ${member.user?.fullName ?? employeeName.get(member.userId) ?? 'member'}`}
                          onClick={() => setEditingId(member.id)}
                        >
                          <RolePills roles={membershipRoles(member)} />
                        </button>
                      )}
                    </td>
                    <td className="cell-right">
                      {/*
                        DELETE deactivates the membership rather than erasing
                        it: the person disappears from the client, their
                        history stays intact.
                      */}
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={remove.loading && pendingId === member.id}
                        onClick={() => {
                          setPendingId(member.id);
                          void remove.mutate(client.id, member.id).then(() => toast.success('Removed from client.'));
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      <form className="inline-form" onSubmit={submit} noValidate>
        <Field label="Employee" htmlFor="assign-user" error={form.formState.errors.userId?.message}>
          <Select id="assign-user" {...form.register('userId')}>
            <option value="">Select an employee</option>
            {assignable.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.fullName ?? employee.email}</option>
            ))}
          </Select>
        </Field>
        <Field label="Roles" htmlFor="assign-roles" error={form.formState.errors.roles?.message}>
          <RoleChecklist
            value={form.watch('roles')}
            onChange={(roles) => form.setValue('roles', roles, { shouldValidate: true })}
          />
        </Field>
        <Button
          type="submit"
          size="sm"
          loading={add.loading}
          // Blocked here rather than letting the 400 teach the rule.
          disabled={assignable.length === 0 || form.watch('roles').length === 0}
        >
          Assign
        </Button>
      </form>

      {assignable.length === 0 && !employees.loading ? (
        <p className="muted">
          Everyone already works on this client. New people are created on the Employees screen first — there is no
          self-sign-up.
        </p>
      ) : null}

      {add.error ? <p className="error-box" role="alert">{add.error}</p> : null}
      {changeRole.error ? <p className="error-box" role="alert">{changeRole.error}</p> : null}
      {remove.error ? <p className="error-box" role="alert">{remove.error}</p> : null}
    </section>
  );
}
