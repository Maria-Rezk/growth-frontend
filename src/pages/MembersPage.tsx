import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { useCompany } from '@/context/CompanyContext';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/State';
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
import { formatDateTime, humanize } from '@/utils/format';

export function MembersPage() {
  return <RequireCompany>{(companyId) => <MembersInner companyId={companyId} />}</RequireCompany>;
}

function MembersInner({ companyId }: { companyId: string }) {
  const { hasRole } = useCompany();
  const canManage = hasRole(CompanyMembershipRole.ACCOUNT_MANAGER);
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
  const updateMember = useMutation(companiesService.updateMember, {
    invalidateKeys: [queryKeys.companyMembers(companyId)],
  });
  const [inviteOpen, setInviteOpen] = useState(false);

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
      header: 'Role',
      // Full enum on purpose. This hits PATCH /members/:id, which can move an
      // existing member to any role — unlike the invite endpoint, which is
      // restricted to INVITABLE_ROLES.
      render: (member) => canManage ? (
        <Select
          aria-label={`Change role for ${member.user?.fullName ?? member.user?.email ?? 'member'}`}
          value={member.role}
          onChange={(event) => updateMember.mutate(companyId, member.id, { role: event.target.value as CompanyMembershipRole })}
        >
          {Object.values(CompanyMembershipRole).map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
        </Select>
      ) : <Badge>{humanize(member.role)}</Badge>,
    },
    { key: 'status', header: 'Status', render: (member) => <Badge tone={member.status === 'ACTIVE' ? 'success' : 'warning'}>{humanize(member.status)}</Badge> },
    { key: 'actions', header: '', className: 'cell-right', render: (member) => canManage ? <Button variant="secondary" size="sm" onClick={() => updateMember.mutate(companyId, member.id, { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button> : null },
  ], [canManage, companyId, updateMember]);

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Client roles, reviewers and team access."
        action={canManage ? <Button size="sm" onClick={() => setInviteOpen(true)}>Invite member</Button> : undefined}
      />

      <DataTable
        columns={columns}
        rows={members.data ?? []}
        rowKey={(member) => member.id}
        loading={members.loading}
        error={members.error}
        onRetry={members.refetch}
        emptyTitle="No members found"
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
                  {invitation.email} · {humanize(invitation.role)} · {formatDateTime(invitation.createdAt)}
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
  // Mirrors the backend's invite DTO, not the full membership enum.
  role: z.enum(INVITABLE_ROLES),
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
    // The dropdown is already constrained to INVITABLE_ROLES, so this mainly
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
      onClose={close}
      title="Invite member"
      footer={result
        ? <Button onClick={close}>Done</Button>
        : (
          <>
            <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
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
            hint="Existing members can be moved to any role from the table above."
            error={form.formState.errors.role?.message}
          >
            <Select id="invite-role" aria-invalid={Boolean(form.formState.errors.role)} {...form.register('role')}>
              {INVITABLE_ROLES.map((item) => (
                <option key={item} value={item}>{humanize(item)}</option>
              ))}
            </Select>
          </Field>
          {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
        </form>
      )}
    </Modal>
  );
}
