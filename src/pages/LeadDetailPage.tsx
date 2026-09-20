import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { ErrorState } from '@/components/ui/State';
import { DetailSkeleton, ListSkeleton } from '@/components/ui/Skeleton';
import { PlusIcon } from '@/components/ui/icons';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Timeline } from '@/components/domain/Timeline';
import { AssigneeOptions, assigneeUserId, assigneeValueFor } from '@/components/domain/AssigneeOptions';
import { appRoutes } from '@/config/appRoutes';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useTaskActor } from '@/hooks/useTaskActor';
import { leadsService } from '@/services/leads';
import { companiesService } from '@/services/companies';
import { tasksService } from '@/services/tasks';
import { TaskModal, type TaskLink } from '@/pages/TasksPage';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, fromInputDateTime, humanize, toInputDateTime } from '@/utils/format';
import { LeadStatus, TaskStatus, TaskType, type LeadNote } from '@/types/domain';
import {
  CLOSED_LEAD_STATUSES,
  LOST_REASONS,
  contactLinks,
  followUpBucket,
  isAdrift,
  suggestNextFollowUp,
  type LostReason,
} from '@/utils/leadFollowUp';
import { formatWaiting, userLabel } from '@/utils/taskReview';

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
  const tasks = useAsync(() => tasksService.list(companyId), [companyId], { queryKey: queryKeys.tasks(companyId) });
  const { userId } = useTaskActor();

  const setStatus = useMutation(leadsService.setStatus, { invalidateKeys: leadsPrefix });
  const update = useMutation(leadsService.update, { invalidateKeys: leadsPrefix });
  const addNoteMutation = useMutation(leadsService.addNote);

  const [note, setNote] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [pendingStatus, setPendingStatus] = useState<LeadStatus | ''>('');
  const [lostReason, setLostReason] = useState<LostReason | ''>('');
  const [nextTouch, setNextTouch] = useState('');
  const [nextTouchTouched, setNextTouchTouched] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [taskLink, setTaskLink] = useState<TaskLink | null>(null);

  const linkedTasks = useMemo(
    () => (tasks.data ?? []).filter((task) => task.relatedEntityType?.toUpperCase() === 'LEAD' && task.relatedEntityId === leadId),
    [leadId, tasks.data],
  );

  if (lead.loading) return <DetailSkeleton />;
  if (lead.error || !lead.data) return <ErrorState message={lead.error ?? 'Lead not found.'} onRetry={lead.refetch} />;

  const current = lead.data;
  const currentStatus = current.status;
  const links = contactLinks(current);
  const bucket = followUpBucket(current);
  const adrift = isAdrift(current);
  const targetStatus = (pendingStatus || currentStatus) as LeadStatus;
  const closing = CLOSED_LEAD_STATUSES.includes(targetStatus);
  const noteRequired = closing;

  const resolveName = (id?: string | null) => {
    if (!id) return 'Unassigned';
    const match = (members.data ?? []).find((x) => x.userId === id);
    if (match) return match.user?.fullName ?? match.user?.email ?? match.userId;
    return members.loading ? '…' : 'Unknown member';
  };

  const chooseStatus = (status: LeadStatus) => {
    setPendingStatus(status);
    setLostReason('');
    // Suggest the next touch for the new stage; keep whatever the person typed.
    if (!nextTouchTouched) setNextTouch(toInputDateTime(suggestNextFollowUp(status)));
  };

  const applyStatus = async () => {
    if (!pendingStatus || pendingStatus === currentStatus) return;
    const reasonPrefix = pendingStatus === LeadStatus.LOST && lostReason ? `[${lostReason}] ` : '';
    const body = `${reasonPrefix}${statusNote.trim()}`.trim();
    if (noteRequired && !statusNote.trim()) return;
    const result = await setStatus.mutate(companyId, leadId, pendingStatus, body || undefined);
    if (!result) return;
    let latest = result;
    // The next touch travels with the status change: one action, two facts.
    const nextIso = closing ? undefined : fromInputDateTime(nextTouch);
    if (!closing && nextIso && nextIso !== current.nextFollowUpAt) {
      const updated = await update.mutate(companyId, leadId, { nextFollowUpAt: nextIso });
      if (updated) latest = updated;
    }
    lead.setData(latest);
    setStatusNote('');
    setPendingStatus('');
    setLostReason('');
    setNextTouch('');
    setNextTouchTouched(false);
    toast.success(`Lead moved to ${humanize(result.status)}.`);
    await history.refetch();
  };

  const saveFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    const iso = fromInputDateTime(followUpDraft);
    const result = await update.mutate(companyId, leadId, { nextFollowUpAt: iso });
    if (result) {
      lead.setData(result);
      setEditingFollowUp(false);
      toast.success(iso ? `Next follow-up ${formatDateTime(iso)}.` : 'Follow-up cleared.');
    }
  };

  const changeAssignee = async (assignedToId: string) => {
    const result = await update.mutate(companyId, leadId, { assignedToId: assignedToId || undefined });
    if (result) lead.setData(result);
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
        title={current.name}
        subtitle="Lead detail, status history and sales notes."
        action={(
          <span className="button-row">
            {links.whatsapp ? <a className="btn btn--secondary btn--sm" href={links.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}
            {links.phone ? <a className="btn btn--secondary btn--sm" href={links.phone}>Call</a> : null}
            {links.email ? <a className="btn btn--secondary btn--sm" href={links.email}>Email</a> : null}
            <ButtonLink to="/leads" variant="secondary" size="sm">Back to leads</ButtonLink>
          </span>
        )}
      />

      {bucket === 'overdue' ? (
        <div className="review-note" role="status">
          <div>
            <p className="review-note__title">Follow-up overdue by {formatWaiting(current.nextFollowUpAt)}</p>
            <p>Was due {formatDateTime(current.nextFollowUpAt)}. Log what happened below and set the next touch.</p>
          </div>
        </div>
      ) : adrift ? (
        <div className="review-note" role="status">
          <div>
            <p className="review-note__title">No follow-up scheduled</p>
            <p>This lead is open and nobody has said when to contact them next. Set a date so it stays on somebody's list.</p>
          </div>
        </div>
      ) : null}

      <div className="detail-grid">
        <section className="detail-main">
          <Card>
            <CardHeader title="Lead overview" action={<StatusBadge value={currentStatus} />} />
            <div className="content-card__body key-values">
              <div><span>Email</span><strong>{links.email ? <a className="table-link" href={links.email}>{current.email}</a> : '—'}</strong></div>
              <div><span>Phone</span><strong>{links.phone ? <a className="table-link" href={links.phone}>{current.phone}</a> : '—'}</strong></div>
              <div><span>Source</span><strong>{current.source ? humanize(current.source) : '—'}</strong></div>
              <div><span>Interested service</span><strong>{current.interestedService ?? '—'}</strong></div>
              <div><span>Assigned</span><strong>{resolveName(current.assignedToId)}</strong></div>
              <div>
                <span>Next follow-up</span>
                <strong className={bucket === 'overdue' ? 'danger-text' : undefined}>
                  {formatDateTime(current.nextFollowUpAt)}
                  {bucket === 'today' ? <> <Badge tone="warning">Today</Badge></> : null}
                </strong>
                <RoleGate permission="leads:manage">
                  {editingFollowUp ? (
                    <form className="inline-form" onSubmit={saveFollowUp}>
                      <Input type="datetime-local" aria-label="Next follow-up" value={followUpDraft} onChange={(event) => setFollowUpDraft(event.target.value)} />
                      <Button size="sm" type="submit" loading={update.loading}>Save</Button>
                      <Button size="sm" type="button" variant="ghost" onClick={() => setEditingFollowUp(false)}>Cancel</Button>
                    </form>
                  ) : (
                    <button type="button" className="link-button" onClick={() => { setFollowUpDraft(toInputDateTime(current.nextFollowUpAt)); setEditingFollowUp(true); }}>
                      {current.nextFollowUpAt ? 'Change' : 'Set a date'}
                    </button>
                  )}
                </RoleGate>
              </div>
              <div><span>Created</span><strong>{formatDateTime(current.createdAt)}</strong></div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" subtitle="Sales context stays on the lead instead of in a chat thread." />
            <div className="content-card__body stack-list">
              <NotesList loading={notes.loading} error={notes.error} data={notes.data} onRetry={notes.refetch} resolveName={resolveName} currentUserId={userId} />

              <form className="inline-form" onSubmit={addNote}>
                <Textarea aria-label="Note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was said, what they need, what happens next…" />
                <Button type="submit" loading={addNoteMutation.loading} disabled={!note.trim()}>Add note</Button>
              </form>
              {addNoteMutation.error ? <p className="error-box" role="alert">{addNoteMutation.error}</p> : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`Follow-up tasks${linkedTasks.length ? ` (${linkedTasks.length})` : ''}`}
              subtitle="Work someone has to do for this lead — a proposal, a call, a demo."
              action={(
                <RoleGate permission="tasks:manage">
                  <Button variant="secondary" size="sm" onClick={() => setTaskLink({ relatedEntityType: 'LEAD', relatedEntityId: leadId, label: current.name, type: TaskType.FOLLOW_UP })}>
                    <PlusIcon size={14} /> Add task
                  </Button>
                </RoleGate>
              )}
            />
            <div className="content-card__body">
              {tasks.loading ? <ListSkeleton rows={2} /> : null}
              {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.refetch} /> : null}
              {tasks.data && linkedTasks.length === 0 ? <p className="muted">No task is attached to this lead yet.</p> : null}
              {linkedTasks.map((task) => (
                <div className="list-row" key={task.id}>
                  <div>
                    <Link className="table-link" to={appRoutes.task(task.id)}>{task.title}</Link>
                    <p className="muted">{humanize(task.type)} · {userLabel(task.assignedTo, 'unassigned')}{task.dueDate ? ` · due ${formatDateTime(task.dueDate)}` : ''}</p>
                  </div>
                  <StatusBadge value={task.status === TaskStatus.DONE ? 'DONE' : task.status} />
                </div>
              ))}
            </div>
          </Card>
        </section>

        <aside className="detail-side">
          <Card>
            <CardHeader title="Update status" />
            <div className="content-card__body form-grid">
              <RoleGate permission="leads:manage" fallback={<p className="muted">Your role cannot change lead status.</p>}>
                {/* Status commits on an explicit action, not on select change,
                    because the note and the next touch land with it in the
                    audit history. */}
                <Field label="New status" htmlFor="lead-status">
                  <Select id="lead-status" value={pendingStatus || currentStatus} onChange={(event) => chooseStatus(event.target.value as LeadStatus)}>
                    {Object.values(LeadStatus).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                  </Select>
                </Field>
                {pendingStatus === LeadStatus.LOST ? (
                  <Field label="Why lost" htmlFor="lead-lost-reason" hint="Recorded with the note, so the monthly report can say why leads are lost.">
                    <Select id="lead-lost-reason" value={lostReason} onChange={(event) => setLostReason(event.target.value as LostReason)}>
                      <option value="">Pick a reason</option>
                      {LOST_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </Select>
                  </Field>
                ) : null}
                <Field
                  label={noteRequired ? 'Status note' : 'Status note (optional)'}
                  htmlFor="lead-status-note"
                  hint={noteRequired ? `Required when closing a lead — say what happened.` : 'Recorded with the status change.'}
                >
                  <Textarea id="lead-status-note" rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                </Field>
                {pendingStatus && !closing ? (
                  <Field label="Next follow-up" htmlFor="lead-next-touch" hint="When to contact them again. Pre-filled for the new stage; change it if you know better.">
                    <Input id="lead-next-touch" type="datetime-local" value={nextTouch} onChange={(event) => { setNextTouch(event.target.value); setNextTouchTouched(true); }} />
                  </Field>
                ) : null}
                <div className="form-actions">
                  <Button
                    size="sm"
                    onClick={applyStatus}
                    loading={setStatus.loading || update.loading}
                    disabled={!pendingStatus || pendingStatus === currentStatus || (noteRequired && !statusNote.trim()) || (pendingStatus === LeadStatus.LOST && !lostReason)}
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
              <RoleGate permission="leads:manage" fallback={<p className="muted">Assigned to {resolveName(current.assignedToId)}.</p>}>
                <Field label="Assigned to" htmlFor="lead-assignee">
                  <Select id="lead-assignee" value={assigneeValueFor(members.data ?? [], current.assignedToId)} disabled={update.loading || members.loading} onChange={(event) => changeAssignee(assigneeUserId(event.target.value))}>
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
                    title: item.fromStatus ? `${humanize(item.fromStatus)} → ${humanize(item.toStatus)}` : `Lead created · ${humanize(item.toStatus)}`,
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

      <TaskModal
        key={taskLink ? 'lead-task' : 'none'}
        open={taskLink !== null}
        companyId={companyId}
        onClose={() => setTaskLink(null)}
        members={members.data ?? []}
        link={taskLink ?? undefined}
        onCreated={() => void tasks.refetch()}
      />
    </>
  );
}

function NotesList({
  loading,
  error,
  data,
  onRetry,
  resolveName,
  currentUserId,
}: {
  loading: boolean;
  error: string | null;
  data: LeadNote[] | null;
  onRetry: () => void;
  resolveName: (id?: string | null) => string;
  currentUserId: string | null;
}) {
  if (loading) return <p className="muted">Loading notes…</p>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data?.length) return <p className="muted">No notes yet.</p>;

  // The API sends an author id and rarely the object; resolve it through the members list.
  const authorName = (item: LeadNote) => {
    if (item.authorId && item.authorId === currentUserId) return 'You';
    return item.author?.fullName ?? item.author?.email ?? (item.authorId ? resolveName(item.authorId) : 'Team member');
  };

  return (
    <>
      {data.map((item) => (
        <div className="comment" key={item.id}>
          <strong>{authorName(item)}</strong>
          <p className="pre-wrap">{item.body}</p>
          <time>{formatDateTime(item.createdAt)}</time>
        </div>
      ))}
    </>
  );
}
