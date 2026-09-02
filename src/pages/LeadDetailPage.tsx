import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Fields';
import { LoadingState, ErrorState } from '@/components/ui/State';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Timeline } from '@/components/domain/Timeline';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { leadsService } from '@/services/leads';
import { companiesService } from '@/services/companies';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, humanize } from '@/utils/format';
import { LeadStatus, type LeadNote } from '@/types/domain';
import { AssigneeOptions, assigneeUserId, assigneeValueFor } from '@/components/domain/AssigneeOptions';

export function LeadDetailPage() {
  const { leadId = '' } = useParams();
  return <RequireCompany>{(companyId) => <LeadDetailInner companyId={companyId} leadId={leadId} />}</RequireCompany>;
}

function LeadDetailInner({ companyId, leadId }: { companyId: string; leadId: string }) {
  // Prefix key so a status change also refreshes the list and pipeline counts.
  const leadsPrefix = [['companies', companyId, 'leads'], queryKeys.lead(companyId, leadId)];

  const lead = useAsync(() => leadsService.get(companyId, leadId), [companyId, leadId], { queryKey: queryKeys.lead(companyId, leadId) });
  const notes = useAsync(() => leadsService.notes(companyId, leadId), [companyId, leadId]);
  const history = useAsync(() => leadsService.statusHistory(companyId, leadId), [companyId, leadId]);
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });

  const setStatus = useMutation(leadsService.setStatus, { invalidateKeys: leadsPrefix });
  const update = useMutation(leadsService.update, { invalidateKeys: leadsPrefix });
  // Was a bare service call: no pending state, errors swallowed, and the
  // button never disabled — a double click filed the note twice.
  const addNoteMutation = useMutation(leadsService.addNote);

  const [note, setNote] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [pendingStatus, setPendingStatus] = useState<LeadStatus | ''>('');

  if (lead.loading) return <LoadingState />;
  if (lead.error || !lead.data) return <ErrorState message={lead.error ?? 'Lead not found.'} onRetry={lead.refetch} />;

  const currentStatus = lead.data.status;

  const resolveName = (id?: string | null) => {
    if (!id) return 'Unassigned';
    const match = (members.data ?? []).find((x) => x.userId === id);
    if (match) return match.user?.fullName ?? match.user?.email ?? match.userId;
    return members.loading ? '…' : 'Unknown member';
  };

  const applyStatus = async () => {
    if (!pendingStatus || pendingStatus === currentStatus) return;
    const result = await setStatus.mutate(companyId, leadId, pendingStatus, statusNote || undefined);
    if (result) {
      lead.setData(result);
      setStatusNote('');
      setPendingStatus('');
      toast.success(`Lead moved to ${humanize(result.status)}.`);
      await history.refetch();
    }
  };

  const changeAssignee = async (assignedToId: string) => {
    const result = await update.mutate(companyId, leadId, { assignedToId: assignedToId || undefined });
    if (result) {
      lead.setData(result);
      toast.success('Assignment updated.');
    }
  };

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    const body = note.trim();
    if (!body) return;
    const created = await addNoteMutation.mutate(companyId, leadId, body);
    if (created) {
      setNote('');
      await notes.refetch();
    }
  };

  return (
    <>
      <PageHeader
        title={lead.data.name}
        subtitle="Lead detail, status history and sales notes."
        action={<ButtonLink to="/leads" variant="secondary" size="sm">Back to leads</ButtonLink>}
      />

      <div className="detail-grid">
        <section className="detail-main">
          <Card>
            <CardHeader title="Lead overview" action={<StatusBadge value={currentStatus} />} />
            <div className="content-card__body key-values">
              <div><span>Email</span><strong>{lead.data.email ?? '—'}</strong></div>
              <div><span>Phone</span><strong>{lead.data.phone ?? '—'}</strong></div>
              <div><span>Source</span><strong>{lead.data.source ? humanize(lead.data.source) : '—'}</strong></div>
              <div><span>Interested service</span><strong>{lead.data.interestedService ?? '—'}</strong></div>
              <div><span>Assigned</span><strong>{resolveName(lead.data.assignedToId)}</strong></div>
              <div><span>Next follow-up</span><strong>{formatDateTime(lead.data.nextFollowUpAt)}</strong></div>
              <div><span>Created</span><strong>{formatDateTime(lead.data.createdAt)}</strong></div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" subtitle="Sales context stays on the lead instead of in a chat thread." />
            <div className="content-card__body stack-list">
              <NotesList loading={notes.loading} error={notes.error} data={notes.data} onRetry={notes.refetch} />

              <form className="inline-form" onSubmit={addNote}>
                <Textarea
                  aria-label="Note"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add sales note…"
                />
                <Button type="submit" loading={addNoteMutation.loading} disabled={!note.trim()}>Add note</Button>
              </form>
              {addNoteMutation.error ? <p className="error-box" role="alert">{addNoteMutation.error}</p> : null}
            </div>
          </Card>
        </section>

        <aside className="detail-side">
          <Card>
            <CardHeader title="Update status" />
            <div className="content-card__body form-grid">
              <RoleGate
                permission="leads:manage"
                fallback={<p className="muted">Your role cannot change lead status.</p>}
              >
                {/*
                  Status commits on an explicit action, not on select change.
                  Previously the select fired immediately, so the note field
                  above it was only recorded if you happened to fill it first —
                  and this write lands in an audit history.
                */}
                <Field label="New status" htmlFor="lead-status">
                  <Select
                    id="lead-status"
                    value={pendingStatus || currentStatus}
                    onChange={(event) => setPendingStatus(event.target.value as LeadStatus)}
                  >
                    {Object.values(LeadStatus).map((item) => (
                      <option key={item} value={item}>{humanize(item)}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status note" htmlFor="lead-status-note" hint="Optional. Recorded with the status change.">
                  <Textarea id="lead-status-note" rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                </Field>
                <div className="form-actions">
                  <Button
                    size="sm"
                    onClick={applyStatus}
                    loading={setStatus.loading}
                    disabled={!pendingStatus || pendingStatus === currentStatus}
                  >
                    Update status
                  </Button>
                </div>
                {setStatus.error ? <p className="error-box" role="alert">{setStatus.error}</p> : null}
              </RoleGate>
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment" />
            <div className="content-card__body">
              <RoleGate
                permission="leads:manage"
                fallback={<p className="muted">Assigned to {resolveName(lead.data.assignedToId)}.</p>}
              >
                <Field label="Assigned to" htmlFor="lead-assignee">
                  <Select
                    id="lead-assignee"
                    value={assigneeValueFor(members.data ?? [], lead.data.assignedToId)}
                    disabled={update.loading || members.loading}
                    onChange={(event) => changeAssignee(assigneeUserId(event.target.value))}
                  >
                    <AssigneeOptions members={members.data ?? []} />
                  </Select>
                </Field>
                {members.error ? <p className="error-text">Could not load members.</p> : null}
                {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
              </RoleGate>
            </div>
          </Card>

          <Card>
            <CardHeader title="Status history" />
            <div className="content-card__body">
              {history.error ? (
                <ErrorState message={history.error} onRetry={history.refetch} />
              ) : (
                <Timeline
                  items={(history.data ?? []).map((item) => ({
                    id: item.id,
                    title: item.fromStatus
                      ? `${humanize(item.fromStatus)} → ${humanize(item.toStatus)}`
                      : `Lead created · ${humanize(item.toStatus)}`,
                    body: item.note,
                    createdAt: item.createdAt,
                  }))}
                  empty={history.loading ? 'Loading history…' : 'No status changes yet.'}
                />
              )}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

/**
 * `notes.data?.map()` followed by `notes.data?.length === 0` rendered nothing
 * at all on failure — both are falsy when the request errored.
 */
function NotesList({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  data: LeadNote[] | null;
  onRetry: () => void;
}) {
  if (loading) return <p className="muted">Loading notes…</p>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data?.length) return <p className="muted">No notes yet.</p>;

  return (
    <>
      {data.map((item) => (
        <div className="comment" key={item.id}>
          <strong>{item.author?.fullName ?? 'Team member'}</strong>
          <p className="pre-wrap">{item.body}</p>
          <time>{formatDateTime(item.createdAt)}</time>
        </div>
      ))}
    </>
  );
}
