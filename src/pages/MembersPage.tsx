import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { useCompany } from '@/context/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { RoleGate } from '@/components/domain/RoleGate';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { invitationAcceptUrl } from '@/config/appRoutes';
import { companiesService } from '@/services/companies';
import { invitationsService } from '@/services/invitations';
import { queryKeys } from '@/lib/queryClient';
import {
  CompanyMembershipRole,
  INVITABLE_ROLES,
  type Invitation,
  type InvitationCreateResult,
  type Membership,
} from '@/types/domain';
import { RoleChecklist, RolePills } from '@/components/domain/RoleChecklist';
import { humanizeRole, membershipRoles, rolesLabel } from '@/utils/roles';
import { formatDateTime, humanize } from '@/utils/format';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

export function MembersPage() {
  return (
    <RequireCompany>
      {(companyId) => (
        <RoleGate
          permission="members:manage"
          fallback={<EmptyState title="Members are managed by the Account Manager" description="Ask them to invite or remove people on this client." />}
        >
          <MembersInner companyId={companyId} />
        </RoleGate>
      )}
    </RequireCompany>
  );
}

function MembersInner({ companyId }: { companyId: string }) {
  const { refreshMemberships } = useCompany();
  const confirm = useConfirm();
  // Inviting and removing: Account Manager, or a platform admin (who passes every company check).
  const canManage = usePermission('members:manage');
  // PATCH /members (roles, suspend) is admin-only; an Account Manager can invite and remove.
  const isAdmin = usePermission('members:administer');
  const members = useAsync(
    () => companiesService.members(companyId),
    [companyId],
    { queryKey: queryKeys.companyMembers(companyId) },
  );
  const invitations = useAsync(
    () => invitationsService.list(companyId),
    [companyId],
    { queryKey: queryKeys.invitations(companyId) },
  );
  // Changing roles here can change the signed-in user's own permissions, and
  // the gates read CompanyContext rather than the members query.
  const updateMember = useMutation(companiesService.updateMember, {
    onSuccess: () => { void refreshMemberships(); },
    invalidateKeys: [queryKeys.companyMembers(companyId)],
  });
  const removeMember = useMutation(companiesService.removeMember, {
    invalidateKeys: [queryKeys.companyMembers(companyId)],
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  // One row's roles open at a time; every other row reads as pills.
  const [editingId, setEditingId] = useState<string | null>(null);

  const columns = useMemo<Column<Membership>[]>(() => [
    {
      key: 'member',
      header: 'Member',
      // Sorts on the name actually rendered, so A→Z matches what is read.
      sortValue: (member) => member.user?.fullName ?? member.user?.email ?? member.userId,
      render: (member) => <div><strong>{member.user?.fullName ?? member.user?.email ?? member.userId}</strong><p className="muted">{member.user?.email ?? member.userId}</p></div>,
    },
    {
      key: 'role',
      header: 'Roles',
      sortValue: (member) => rolesLabel(member),
      // Full enum on purpose. This hits PATCH /members/:id, which can set any
      // roles on an existing member — unlike the invite endpoint, which is
      // restricted to INVITABLE_ROLES.
      render: (member) => {
        if (!isAdmin) return <RolePills roles={membershipRoles(member)} />;
        const name = member.user?.fullName ?? member.user?.email ?? 'member';
        if (editingId !== member.id) {
          return (
            <button type="button" className="role-pills-button" aria-label={`Change roles for ${name}`} onClick={() => setEditingId(member.id)}>
              <RolePills roles={membershipRoles(member)} />
            </button>
          );
        }
        return (
          <div className="role-editor">
            <RoleChecklist
              value={membershipRoles(member)}
              disabled={updateMember.loading}
              /*
                The list sent is the list they end up with, and an empty one is a
                400. Removing the last role means removing the person, which is the
                Suspend control beside this — so the final tick cannot be cleared
                here.
              */
              onChange={(roles) => {
                if (roles.length === 0) {
                  toast.error('A member needs at least one role. Suspend them instead.');
                  return;
                }
                void updateMember.mutate(companyId, member.id, { roles }).then((updated) => { if (updated) toast.success('Roles updated.'); });
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Done</Button>
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (member) => <Badge tone={member.status === 'ACTIVE' ? 'success' : 'warning'}>{humanize(member.status)}</Badge> },
    { key: 'actions', header: '', className: 'cell-right', render: (member) => {
        if (isAdmin) {
          const suspending = member.status === 'ACTIVE';
          const name = member.user?.fullName ?? member.user?.email ?? 'this person';
          return (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                // Suspending cuts somebody's access on the spot: confirm it. Reactivating restores it and needs no guard.
                if (suspending) {
                  const ok = await confirm({ title: 'Suspend member', message: <>Suspend <strong>{name}</strong>? They lose access to this client until reactivated. Nothing they did is deleted.</>, confirmLabel: 'Suspend', tone: 'danger' });
                  if (!ok) return;
                }
                const updated = await updateMember.mutate(companyId, member.id, { status: suspending ? 'SUSPENDED' : 'ACTIVE' });
                if (updated) toast.success(suspending ? `${name} suspended.` : `${name} reactivated.`);
              }}
            >
              {suspending ? 'Suspend' : 'Reactivate'}
            </Button>
          );
        }
        if (!canManage || member.status !== 'ACTIVE') return null;
        const name = member.user?.fullName ?? member.user?.email ?? 'this person';
        return (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const ok = await confirm({ title: 'Remove member', message: <>Remove <strong>{name}</strong> from this client? They lose access, and their history is kept.</>, confirmLabel: 'Remove', tone: 'danger' });
              if (ok) void removeMember.mutate(companyId, member.id);
            }}
          >
            Remove
          </Button>
        );
      },
    },
  ], [canManage, companyId, confirm, editingId, isAdmin, removeMember, updateMember]);

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Client-side people are invited here. Your own team is assigned from Platform admin › Employees, which is why the invite list offers a limited set of roles."
        action={canManage ? <Button size="sm" onClick={() => setInviteOpen(true)}>Invite member</Button> : undefined}
      />

      {updateMember.error || removeMember.error ? <p className="error-box" role="alert">{updateMember.error ?? removeMember.error}</p> : null}

      <DataTable
        columns={columns}
        rows={members.data ?? []}
        rowKey={(member) => member.id}
        loading={members.loading}
        error={members.error}
        onRetry={members.refetch}
        emptyTitle="No members found"
        emptyDescription="Invite the client's owner and reviewers so they can approve content, and assign your team from the admin area."
        emptyAction={canManage ? <Button size="sm" onClick={() => setInviteOpen(true)}>Invite the first member</Button> : undefined}
        defaultSortKey="member"
      />

      <section className="section-block">
        <h2>Pending invitations</h2>
        <PendingInvitations
          loading={invitations.loading}
          error={invitations.error}
          data={invitations.data}
          onRetry={invitations.refetch}
        />
      </section>

      <InviteModal open={inviteOpen} companyId={companyId} onClose={() => setInviteOpen(false)} />
    </>
  );
}

/**
 * A failed fetch and an empty list are different states. Previously both fell
 * through to "No pending invitations", so a broken request looked like a
 * successful empty one.
 */
function PendingInvitations({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  data: Invitation[] | null;
  onRetry: () => void;
}) {
  if (loading) {
    return <Card><div className="state-block">Loading invitations…</div></Card>;
  }

  if (error) {
    return <Card><ErrorState message={error} onRetry={onRetry} /></Card>;
  }

  if (!data?.length) {
    return (
      <Card>
        <EmptyState
          title="No pending invitations"
          description="Invited members appear here until they accept."
        />
      </Card>
    );
  }

  return (
    <div className="card-grid">
      {data.map((invitation) => (
        <Card key={invitation.id}>
          <div className="content-card__body">
            <div className="list-row">
              <div>
                <strong>{invitation.fullName ?? invitation.email}</strong>
                <p className="muted">
                  {invitation.email} · {rolesLabel(invitation)} · {formatDateTime(invitation.createdAt)}
                </p>
              </div>
              <Badge tone={invitation.status === 'PENDING' ? 'warning' : 'neutral'}>
                {humanize(invitation.status)}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  // One role: the invitation endpoint takes a single `role` (and rejects `roles`).
  // Further roles are added from the members table once they have joined.
  role: z.enum(INVITABLE_ROLES, { errorMap: () => ({ message: 'Pick a role.' }) }),
});

type InviteForm = z.infer<typeof inviteSchema>;

function InviteModal({ open, companyId, onClose }: { open: boolean; companyId: string; onClose: () => void }) {
  const [result, setResult] = useState<InvitationCreateResult | null>(null);

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { fullName: '', email: '', role: CompanyMembershipRole.CLIENT_REVIEWER },
    mode: 'onBlur',
  });

  const create = useMutation(invitationsService.create, {
    invalidateKeys: [queryKeys.invitations(companyId)],
    // The select is already constrained to INVITABLE_ROLES, so this mainly
    // catches duplicate-email and expired-membership rejections.
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    const created = await create.mutate(companyId, {
      email: values.email,
      role: values.role,
      fullName: values.fullName,
    });
    if (created) {
      setResult(created);
      toast.success('Invitation created.');
    }
  });

  // Reset both the form and the mutation, otherwise a previous error or
  // success token is still on screen the next time the modal opens.
  const close = () => {
    form.reset();
    create.reset();
    setResult(null);
    onClose();
  };
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  const acceptUrl = result ? invitationAcceptUrl(result.invitationToken) : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(acceptUrl);
      toast.success('Invitation link copied.');
    } catch {
      // Clipboard API needs a secure context; over plain HTTP it throws.
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      title="Invite member"
      footer={result
        ? <Button onClick={cancel}>Done</Button>
        : (
          <>
            <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
            <Button form="invite-form" type="submit" loading={form.formState.isSubmitting || create.loading}>
              Create invitation
            </Button>
          </>
        )}
    >
      {result ? (
        <div className="token-box">
          <p className="muted">Share this link now — the token is shown only once.</p>
          <code>{acceptUrl}</code>
          <div className="button-row">
            <Button variant="secondary" size="sm" onClick={copyLink}>Copy link</Button>
          </div>
        </div>
      ) : (
        <form id="invite-form" className="form-grid" onSubmit={submit} noValidate>
          <Field label="Full name" htmlFor="invite-name" error={form.formState.errors.fullName?.message}>
            <Input
              id="invite-name"
              autoComplete="name"
              aria-invalid={Boolean(form.formState.errors.fullName)}
              {...form.register('fullName')}
            />
          </Field>
          <Field label="Email" htmlFor="invite-email" error={form.formState.errors.email?.message}>
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register('email')}
            />
          </Field>
          <Field
            label="Role"
            htmlFor="invite-role"
            hint="An invitation carries one role. More can be added from the members table once they have joined."
            error={form.formState.errors.role?.message}
          >
            <Select id="invite-role" {...form.register('role')}>
              {INVITABLE_ROLES.map((role) => <option key={role} value={role}>{humanizeRole(role)}</option>)}
            </Select>
          </Field>
          {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
        </form>
      )}
    </Modal>
  );
}
