import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Fields';
import { LoadingState, ErrorState } from '@/components/ui/State';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Timeline } from '@/components/domain/Timeline';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { leadsService } from '@/services/leads';
import { companiesService } from '@/services/companies';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, humanize } from '@/utils/format';
import { LeadStatus } from '@/types/domain';

export function LeadDetailPage() {
  const { leadId = '' } = useParams();
  return <RequireCompany>{(companyId) => <LeadDetailInner companyId={companyId} leadId={leadId} />}</RequireCompany>;
}

function LeadDetailInner({ companyId, leadId }: { companyId: string; leadId: string }) {
  const lead = useAsync(() => leadsService.get(companyId, leadId), [companyId, leadId], { queryKey: queryKeys.lead(companyId, leadId) });
  const notes = useAsync(() => leadsService.notes(companyId, leadId), [companyId, leadId]);
  const history = useAsync(() => leadsService.statusHistory(companyId, leadId), [companyId, leadId]);
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });

  const setStatus = useMutation(leadsService.setStatus, { invalidateKeys: [['companies', companyId, 'leads'], queryKeys.lead(companyId, leadId)] });
  const update = useMutation(leadsService.update, { invalidateKeys: [['companies', companyId, 'leads'], queryKeys.lead(companyId, leadId)] });

  const [note, setNote] = useState('');
  const [statusNote, setStatusNote] = useState('');

  if (lead.loading) return <LoadingState />;
  if (lead.error || !lead.data) return <ErrorState message={lead.error ?? 'Lead not found.'} onRetry={lead.refetch} />;

  const resolveName = (id?: string | null) => {
    if (!id) return 'Unassigned';
    const m = (members.data ?? []).find((x) => x.userId === id);
    return m ? (m.user?.fullName ?? m.user?.email ?? m.userId) : 'Assigned';
  };

  const changeStatus = async (status: LeadStatus) => {
    const result = await setStatus.mutate(companyId, leadId, status, statusNote || undefined);
    if (result) { lead.setData(result); setStatusNote(''); await history.refetch(); }
  };
  const changeAssignee = async (assignedToId: string) => {
    const result = await update.mutate(companyId, leadId, { assignedToId: assignedToId || undefined });
    if (result) { lead.setData(result); }
  };
  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    await leadsService.addNote(companyId, leadId, note.trim());
    setNote(''); await notes.refetch();
  };

  return (
    <>
      <PageHeader title={lead.data.name} subtitle="Lead detail, status history and sales notes." action={<Link to="/leads"><Button variant="secondary">Back</Button></Link>} />
      <div className="detail-grid">
        <section className="detail-main">
          <Card className="content-card"><CardHeader title="Lead overview" action={<StatusBadge value={lead.data.status} />} /><div className="content-card__body key-values">
            <div><span>Email</span><strong>{lead.data.email ?? '—'}</strong></div>
            <div><span>Phone</span><strong>{lead.data.phone ?? '—'}</strong></div>
            <div><span>Source</span><strong>{lead.data.source ? humanize(lead.data.source) : '—'}</strong></div>
            <div><span>Interested service</span><strong>{lead.data.interestedService ?? '—'}</strong></div>
            <div><span>Assigned</span><strong>{resolveName(lead.data.assignedToId)}</strong></div>
            <div><span>Next follow-up</span><strong>{formatDateTime(lead.data.nextFollowUpAt)}</strong></div>
            <div><span>Created</span><strong>{formatDateTime(lead.data.createdAt)}</strong></div>
          </div></Card>
          <Card className="content-card"><CardHeader title="Notes" /><div className="content-card__body stack-list">{notes.data?.map((item) => <div className="comment" key={item.id}><strong>{item.author?.fullName ?? 'Team member'}</strong><p>{item.body}</p><time>{formatDateTime(item.createdAt)}</time></div>)}{notes.data?.length === 0 ? <p className="muted">No notes yet.</p> : null}<form className="inline-form" onSubmit={addNote}><Textarea aria-label="Note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add sales note…" /><Button type="submit">Add note</Button></form></div></Card>
        </section>
        <aside className="detail-side">
          <Card className="content-card"><CardHeader title="Update status" /><div className="content-card__body form-grid">
            <Field label="Status note" htmlFor="lead-status-note" hint="Optional. Recorded with the status change."><Textarea id="lead-status-note" rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} /></Field>
            <Field label="Status" htmlFor="lead-status"><Select id="lead-status" value={lead.data.status} onChange={(event) => changeStatus(event.target.value as LeadStatus)}>{Object.values(LeadStatus).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
            {setStatus.error ? <p className="error-box" role="alert">{setStatus.error}</p> : null}
          </div></Card>
          <Card className="content-card"><CardHeader title="Assignment" /><div className="content-card__body"><Field label="Assigned to" htmlFor="lead-assignee"><Select id="lead-assignee" value={lead.data.assignedToId ?? ''} onChange={(event) => changeAssignee(event.target.value)}><option value="">Unassigned</option>{(members.data ?? []).map((member) => <option key={member.id} value={member.userId}>{member.user?.fullName ?? member.user?.email ?? member.userId} · {humanize(member.role)}</option>)}</Select></Field>{update.error ? <p className="error-box" role="alert">{update.error}</p> : null}</div></Card>
          <Card className="content-card"><CardHeader title="Status history" /><div className="content-card__body"><Timeline items={(history.data ?? []).map((item) => ({
            id: item.id,
            title: item.fromStatus
              ? `${humanize(item.fromStatus)} → ${humanize(item.toStatus)}`
              : `Lead created · ${humanize(item.toStatus)}`,
            body: item.note,
            createdAt: item.createdAt,
          }))} /></div></Card>
        </aside>
      </div>
    </>
  );
}