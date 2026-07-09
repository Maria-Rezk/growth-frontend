import { FormEvent, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { useCompany } from '@/context/CompanyContext';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { companiesService } from '@/services/companies';
import { invitationsService } from '@/services/invitations';
import { queryKeys } from '@/lib/queryClient';
import { CompanyMembershipRole, type Invitation, type InvitationCreateResult, type Membership } from '@/types/domain';
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
    { key: 'member', header: 'Member', render: (member) => <div><strong>{member.user?.fullName ?? member.user?.email ?? member.userId}</strong><p className="muted">{member.user?.email ?? member.userId}</p></div> },
    {
      key: 'role',
      header: 'Role',
      render: (member) => canManage ? (
        <Select
          aria-label={`Change role for ${member.user?.fullName ?? member.user?.email ?? 'member'}`}
          value={member.role}
          onChange={(event) => updateMember.mutate(companyId, member.id, { role: event.target.value as CompanyMembershipRole })}
        >
          {Object.values(CompanyMembershipRole).map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
        </Select>
      ) : <Badge>{humanize(member.role)}</Badge>,
    }, { key: 'status', header: 'Status', render: (member) => <Badge tone={member.status === 'ACTIVE' ? 'success' : 'warning'}>{humanize(member.status)}</Badge> },
    { key: 'actions', header: '', className: 'cell-right', render: (member) => canManage ? <Button variant="secondary" size="sm" onClick={() => updateMember.mutate(companyId, member.id, { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button> : null },
  ], [canManage, companyId, updateMember]);

  return (
    <>
      <PageHeader title="Members & invitations" subtitle="Manage company roles, client reviewers and team access." action={canManage ? <Button onClick={() => setInviteOpen(true)}>Invite member</Button> : undefined} />
      <DataTable columns={columns} rows={members.data ?? []} rowKey={(member) => member.id} loading={members.loading} error={members.error} onRetry={members.refetch} emptyTitle="No members found" />
      <section className="section-block">
        <h2>Pending invitations</h2>
        {invitations.loading ? <Card className="content-card"><div className="content-card__body muted">Loading invitations…</div></Card> : null}
        {invitations.data?.length ? (
          <div className="card-grid">
            {invitations.data.map((invitation: Invitation) => (
              <Card key={invitation.id} className="content-card">
                <div className="content-card__body">
                  <div className="list-row">
                    <div><strong>{invitation.fullName ?? invitation.email}</strong><p className="muted">{invitation.email} · {humanize(invitation.role)} · {formatDateTime(invitation.createdAt)}</p></div>
                    <Badge tone={invitation.status === 'PENDING' ? 'warning' : 'neutral'}>{humanize(invitation.status)}</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : !invitations.loading ? <p className="muted">No pending invitations.</p> : null}
      </section>
      <InviteModal open={inviteOpen} companyId={companyId} onClose={() => setInviteOpen(false)} />
    </>
  );
}

function InviteModal({ open, companyId, onClose }: { open: boolean; companyId: string; onClose: () => void }) {
  const create = useMutation(invitationsService.create, {
    invalidateKeys: [queryKeys.invitations(companyId)],
  });
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<CompanyMembershipRole>(CompanyMembershipRole.CLIENT_REVIEWER);
  const [result, setResult] = useState<InvitationCreateResult | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.includes('@') || !fullName.trim()) return;
    const created = await create.mutate(companyId, { email, role, fullName: fullName.trim() });
    if (created) {
      setResult(created);
      toast.success('Invitation created.');
    }
  };

  const close = () => { setEmail(''); setFullName(''); setResult(null); onClose(); };

  const acceptUrl = result ? `${window.location.origin}${result.acceptPath}` : '';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite member"
      footer={result
        ? <Button onClick={close}>Done</Button>
        : <><Button variant="secondary" type="button" onClick={close}>Cancel</Button><Button form="invite-form" type="submit" loading={create.loading}>Create invitation</Button></>}
    >
      {result ? (
        <div className="token-box">
          <p className="muted">Share this invitation link now — the token is shown only once.</p>
          <code>{acceptUrl}</code>
          <Button variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(acceptUrl)}>Copy link</Button>
        </div>
      ) : (
        <form id="invite-form" className="form-grid" onSubmit={submit}>
          <Field label="Full name" htmlFor="invite-name"><Input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></Field>
          <Field label="Email" htmlFor="invite-email"><Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
          <Field label="Role" htmlFor="role"><Select id="role" value={role} onChange={(event) => setRole(event.target.value as CompanyMembershipRole)}>{Object.values(CompanyMembershipRole).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
        </form>
      )}
    </Modal>
  );
}