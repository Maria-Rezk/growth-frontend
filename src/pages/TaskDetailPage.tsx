import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, Textarea, Input } from '@/components/ui/Fields';
import { LoadingState, ErrorState } from '@/components/ui/State';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Timeline } from '@/components/domain/Timeline';
import { ReviewNoteBanner, TaskReviewPanel } from '@/components/domain/TaskReviewPanel';
import { AttachmentList } from '@/components/domain/AttachmentList';
import { Badge } from '@/components/ui/Badge';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { tasksService } from '@/services/tasks';
import { companiesService } from '@/services/companies';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, humanize } from '@/utils/format';
import { isOverdue } from '@/utils/workflow';
import { STATUS_OPTIONS, approverIsInactive, isInReview, userLabel } from '@/utils/taskReview';
import { TaskStatus, type TaskActivityLog, type TaskComment } from '@/types/domain';
import { AssigneeOptions, assigneeUserId, assigneeValueFor } from '@/components/domain/AssigneeOptions';

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  return <RequireCompany>{(companyId) => <TaskDetailInner companyId={companyId} taskId={taskId} />}</RequireCompany>;
}

function TaskDetailInner({ companyId, taskId }: { companyId: string; taskId: string }) {
  const tasksPrefix = [['companies', companyId, 'tasks'], queryKeys.task(companyId, taskId)];

  const task = useAsync(() => tasksService.get(companyId, taskId), [companyId, taskId], { queryKey: queryKeys.task(companyId, taskId) });
  const comments = useAsync(() => tasksService.comments(companyId, taskId), [companyId, taskId]);
  const logs = useAsync(() => tasksService.activityLogs(companyId, taskId), [companyId, taskId]);
  const attachments = useAsync(() => tasksService.attachments(companyId, taskId), [companyId, taskId]);
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });

  const setStatus = useMutation(tasksService.setStatus, { invalidateKeys: tasksPrefix });
  const update = useMutation(tasksService.update, { invalidateKeys: tasksPrefix });
  // Was a bare service call — no pending state, errors swallowed, and a double
  // click filed the comment twice.
  const addCommentMutation = useMutation(tasksService.addComment);
  // The service already pairs upload + attach; doing it manually here
  // duplicated that logic and lost the error from whichever half failed.
  const attachMutation = useMutation(tasksService.uploadAndAttach);
  const detachMutation = useMutation(tasksService.removeAttachment);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [comment, setComment] = useState('');

  if (task.loading) return <LoadingState />;
  if (task.error || !task.data) return <ErrorState message={task.error ?? 'Task not found.'} onRetry={task.refetch} />;

  const current = task.data;
  const overdue = isOverdue(current.dueDate) && current.status !== TaskStatus.DONE && current.status !== TaskStatus.CANCELED;
  const inReview = isInReview(current);

  const resolveName = (id?: string | null) => {
    if (!id) return 'Unassigned';
    const match = (members.data ?? []).find((x) => x.userId === id);
    if (match) return match.user?.fullName ?? match.user?.email ?? match.userId;
    return members.loading ? '…' : 'Unknown member';
  };

  const changeStatus = async (status: TaskStatus) => {
    const result = await setStatus.mutate(companyId, taskId, status);
    if (result) {
      task.setData(result);
      toast.success(`Task moved to ${humanize(result.status)}.`);
      await logs.refetch();
    }
  };

  const changeAssignee = async (assignedToId: string) => {
    const result = await update.mutate(companyId, taskId, { assignedToId: assignedToId || undefined });
    if (result) {
      task.setData(result);
      toast.success('Assignment updated.');
      await logs.refetch();
    }
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    const body = comment.trim();
    if (!body) return;
    const created = await addCommentMutation.mutate(companyId, taskId, body);
    if (created) {
      setComment('');
      await comments.refetch();
    }
  };

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    const result = await attachMutation.mutate(companyId, taskId, file);
    // Clear the input either way, so re-picking the same file re-fires change.
    input.value = '';
    if (result) {
      toast.success('Attachment added.');
      await attachments.refetch();
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    setRemovingId(attachmentId);
    try {
      const result = await detachMutation.mutate(companyId, taskId, attachmentId);
      if (result !== null) {
        toast.success('Attachment removed.');
        await attachments.refetch();
      }
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title={current.title}
        subtitle="Task detail, collaboration and activity log."
        action={<ButtonLink to="/tasks" variant="secondary" size="sm">Back to tasks</ButtonLink>}
      />

      <div className="detail-grid">
        <section className="detail-main">
          <ReviewNoteBanner task={current} />

          <Card>
            <CardHeader title="Task" action={<StatusBadge value={current.status} />} />
            <div className="content-card__body">
              <p className="pre-wrap">{current.description || 'No description.'}</p>
              <div className="key-values">
                <div><span>Priority</span><strong><StatusBadge value={current.priority} /></strong></div>
                <div><span>Type</span><strong>{humanize(current.type)}</strong></div>
                <div><span>Assigned</span><strong>{resolveName(current.assignedToId)}</strong></div>
                <div>
                  <span>Approver</span>
                  <strong>
                    {current.approverId ? userLabel(current.approver, resolveName(current.approverId)) : <Badge tone="warning">Needs an approver</Badge>}
                    {approverIsInactive(current) ? <> <Badge tone="danger">Deactivated</Badge></> : null}
                  </strong>
                </div>
                <div>
                  <span>{overdue ? 'Overdue' : 'Due'}</span>
                  <strong className={overdue ? 'danger-text' : undefined}>{formatDateTime(current.dueDate)}</strong>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Comments" />
            <div className="content-card__body stack-list">
              <CommentsList loading={comments.loading} error={comments.error} data={comments.data} onRetry={comments.refetch} />

              <form className="inline-form" onSubmit={addComment}>
                <Textarea
                  aria-label="Comment"
                  rows={3}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a comment…"
                />
                <Button type="submit" loading={addCommentMutation.loading} disabled={!comment.trim()}>Send</Button>
              </form>
              {addCommentMutation.error ? <p className="error-box" role="alert">{addCommentMutation.error}</p> : null}
            </div>
          </Card>
        </section>

        <aside className="detail-side">
          <TaskReviewPanel
            companyId={companyId}
            task={current}
            members={members.data ?? []}
            membersLoading={members.loading}
            onTask={task.setData}
            onActivity={() => void logs.refetch()}
          />

          <Card>
            <CardHeader title="Status" />
            <div className="content-card__body">
              <RoleGate permission="tasks:manage" fallback={<p className="muted">Your role cannot change task status.</p>}>
                {/*
                  `IN_REVIEW` is not on offer in either direction: the status
                  endpoint answers 409 REVIEW_ACTIONS_ONLY. While the task is in
                  review the status is read-only and the review card above owns
                  the verdict; the one status still allowed from here is Cancel.
                */}
                {inReview ? (
                  <div className="stack-list">
                    <p className="muted">
                      In review — waiting on {userLabel(current.approver, 'an approver')}. Approve or request changes from the review card.
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={setStatus.loading}
                      onClick={() => {
                        if (window.confirm('Cancel this task? It leaves the approval queue and the waiting clock is cleared.')) {
                          void changeStatus(TaskStatus.CANCELED);
                        }
                      }}
                    >
                      Cancel task
                    </Button>
                  </div>
                ) : (
                  <Field label="Status" htmlFor="task-status" hint="Review is entered with “Submit for review”, not from here.">
                    <Select
                      id="task-status"
                      value={current.status}
                      disabled={setStatus.loading}
                      onChange={(event) => changeStatus(event.target.value as TaskStatus)}
                    >
                      {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                    </Select>
                  </Field>
                )}
                {setStatus.error ? <p className="error-box" role="alert">{setStatus.error}</p> : null}
              </RoleGate>
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment" />
            <div className="content-card__body">
              <RoleGate
                permission="tasks:manage"
                fallback={<p className="muted">Assigned to {resolveName(current.assignedToId)}.</p>}
              >
                <Field label="Assigned to" htmlFor="task-assignee">
                  <Select
                    id="task-assignee"
                    value={assigneeValueFor(members.data ?? [], current.assignedToId)}
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
            <CardHeader title="Attachments" subtitle="Briefs, drafts, exports — anyone on the task can add or open them." />
            <div className="content-card__body stack-list">
              {/* Every role holds `assets:upload`; the gate stays so a future narrowing is one line in permissions.ts. */}
              <RoleGate permission="assets:upload" fallback={<p className="muted">Your role cannot upload attachments.</p>}>
                <Input
                  type="file"
                  aria-label="Upload attachment"
                  disabled={attachMutation.loading}
                  onChange={(event) => onFile(event.target)}
                />
                {attachMutation.loading ? <p className="muted" aria-live="polite">Uploading…</p> : null}
                {attachMutation.error ? <p className="error-box" role="alert">{attachMutation.error}</p> : null}
              </RoleGate>

              <AttachmentList
                companyId={companyId}
                loading={attachments.loading}
                error={attachments.error}
                data={attachments.data}
                onRetry={attachments.refetch}
                onRemove={(attachment) => removeAttachment(attachment.id)}
                removing={removingId}
              />
              {detachMutation.error ? <p className="error-box" role="alert">{detachMutation.error}</p> : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="content-card__body">
              {logs.error ? (
                <ErrorState message={logs.error} onRetry={logs.refetch} />
              ) : (
                <Timeline
                  items={(logs.data ?? []).map((item) => ({ id: item.id, ...describeActivity(item, resolveName), createdAt: item.createdAt }))}
                  empty={logs.loading ? 'Loading activity…' : 'No activity yet.'}
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
 * The audit trail in words. The review rows carry who approved and what they
 * said, which is the whole point of recording them — "Approved by Omar" as a
 * row, not a comment somebody has to scroll for.
 */
function describeActivity(log: TaskActivityLog, resolveName: (id?: string | null) => string): { title: string; body?: string } {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const approver = typeof meta.approverId === 'string' ? resolveName(meta.approverId) : null;
  switch (log.action) {
    case 'TASK_SUBMITTED_FOR_REVIEW':
      return { title: 'Submitted for review', body: approver ? `Waiting on ${approver}` : undefined };
    case 'TASK_APPROVED':
      return { title: approver ? `Approved by ${approver}` : 'Approved' };
    case 'TASK_CHANGES_REQUESTED':
      return { title: approver ? `Changes requested by ${approver}` : 'Changes requested', body: typeof meta.note === 'string' ? meta.note : undefined };
    case 'TASK_APPROVER_CHANGED':
      return {
        title: 'Approver changed',
        body: `${typeof meta.from === 'string' ? resolveName(meta.from) : 'Nobody'} → ${typeof meta.to === 'string' ? resolveName(meta.to) : 'Nobody'}`,
      };
    case 'CREATED':
    case 'TASK_CREATED':
      return {
        title: 'Created',
        body: approver ? `Approver: ${approver}${meta.approverResolvedFromMatrix ? ' (from the responsibility matrix)' : ''}` : undefined,
      };
    default:
      return { title: humanize(log.action) };
  }
}

/** Previously `comments.data?.map()` with no empty and no error branch. */
function CommentsList({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  data: TaskComment[] | null;
  onRetry: () => void;
}) {
  if (loading) return <p className="muted">Loading comments…</p>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data?.length) return <p className="muted">No comments yet.</p>;

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
