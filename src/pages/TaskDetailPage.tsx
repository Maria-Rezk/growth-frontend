import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Fields';
import { ErrorState } from '@/components/ui/State';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Timeline } from '@/components/domain/Timeline';
import { ReviewNoteBanner, TaskReviewPanel } from '@/components/domain/TaskReviewPanel';
import { AttachmentsPanel } from '@/components/domain/AttachmentsPanel';
import { Badge } from '@/components/ui/Badge';
import { TaskModal } from '@/components/domain/TaskFormModal';
import { TaskTypeChips } from '@/components/domain/TaskTypes';
import { appRoutes } from '@/config/appRoutes';
import { errorCode } from '@/lib/http';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useTaskActor } from '@/hooks/useTaskActor';
import { tasksService } from '@/services/tasks';
import { queryKeys } from '@/lib/queryClient';
import { useAssignableMembers } from '@/hooks/useAssignableMembers';
import { formatDateTime, humanize } from '@/utils/format';
import { isOverdue } from '@/utils/workflow';
import { STATUS_OPTIONS, approverIsInactive, isInReview, userLabel } from '@/utils/taskReview';
import { TaskReviewErrorCode, TaskStatus, type TaskActivityLog, type TaskComment } from '@/types/domain';
import { TaskPeopleList } from '@/components/domain/TaskPeople';
import { useLocale } from '@/context/LocaleContext';
import type { AppLanguage } from '@/i18n/messages';
import { readAssigneeChanges, taskRoleLabel } from '@/utils/taskAssignees';
import { DetailSkeleton } from '@/components/ui/Skeleton';

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  return <RequireCompany>{(companyId) => <TaskDetailInner companyId={companyId} taskId={taskId} />}</RequireCompany>;
}

function TaskDetailInner({ companyId, taskId }: { companyId: string; taskId: string }) {
  const tasksPrefix = [['companies', companyId, 'tasks'], queryKeys.task(companyId, taskId)];

  const task = useAsync(() => tasksService.get(companyId, taskId), [companyId, taskId], { queryKey: queryKeys.task(companyId, taskId) });
  const comments = useAsync(() => tasksService.comments(companyId, taskId), [companyId, taskId]);
  const logs = useAsync(() => tasksService.activityLogs(companyId, taskId), [companyId, taskId]);
  const members = useAssignableMembers(companyId);

  const setStatus = useMutation(tasksService.setStatus, { invalidateKeys: tasksPrefix });
  // Was a bare service call — no pending state, errors swallowed, and a double
  // click filed the comment twice.
  const addCommentMutation = useMutation(tasksService.addComment);
  // 409 NOT_A_DRAFT: it was published (or discarded) from somewhere else. Reload rather than retry.
  const staleDraft = (error: unknown) => {
    if (errorCode(error) === TaskReviewErrorCode.NOT_A_DRAFT) void task.refetch();
  };
  const publishDraft = useMutation(tasksService.publishDraft, { invalidateKeys: tasksPrefix, onError: staleDraft });
  const discardDraft = useMutation(tasksService.discardDraft, { invalidateKeys: tasksPrefix, onError: staleDraft });
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const [comment, setComment] = useState('');
  const { userId: actorId } = useTaskActor();
  const confirm = useConfirm();
  const { lang } = useLocale();

  if (task.loading) return <DetailSkeleton />;
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

  const onPublish = async () => {
    const result = await publishDraft.mutate(companyId, taskId);
    if (result) {
      task.setData(result);
      toast.success('Published. Everybody on it has been told.');
      await logs.refetch();
    }
  };

  const onDiscard = async () => {
    const ok = await confirm({
      title: 'Discard this draft?',
      message: 'It is deleted for good. Nobody has been told about it.',
      confirmLabel: 'Discard draft',
      tone: 'danger',
    });
    if (!ok) return;
    const done = await discardDraft.mutate(companyId, taskId);
    if (done !== null) {
      toast.success('Draft discarded.');
      navigate(`${appRoutes.tasks}?scope=drafts`);
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

  return (
    <>
      <PageHeader
        title={current.title}
        subtitle="Task detail, collaboration and activity log."
        action={<ButtonLink to="/tasks" variant="secondary" size="sm">Back to tasks</ButtonLink>}
      />

      {editing ? (
        <TaskModal
          key={current.id}
          open
          companyId={companyId}
          members={members.data ?? []}
          task={current}
          onClose={() => setEditing(false)}
          onSaved={(saved) => { task.setData(saved); void logs.refetch(); }}
        />
      ) : null}

      <div className="detail-grid">
        <section className="detail-main">
          {current.isDraft ? (
            <Card className="draft-banner">
              <div className="content-card__body stack-list">
                <p><Badge tone="neutral">Draft</Badge> Only you can see this. Nobody has been told, and it cannot change status until it is published.</p>
                <div className="button-row">
                  <RoleGate permission="tasks:edit">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={publishDraft.loading || discardDraft.loading}>Edit draft</Button>
                  </RoleGate>
                  <Button size="sm" onClick={() => void onPublish()} loading={publishDraft.loading} disabled={discardDraft.loading}>Publish</Button>
                  <Button size="sm" variant="ghost" onClick={() => void onDiscard()} loading={discardDraft.loading} disabled={publishDraft.loading}>Discard draft</Button>
                </div>
                {publishDraft.error || discardDraft.error ? <p className="error-box" role="alert">{publishDraft.error ?? discardDraft.error}</p> : null}
              </div>
            </Card>
          ) : null}
          <ReviewNoteBanner task={current} />

          <Card>
            <CardHeader
              title="Task"
              action={(
                <span className="button-row">
                  <RoleGate permission="tasks:edit">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
                  </RoleGate>
                  <StatusBadge value={current.status} />
                </span>
              )}
            />
            <div className="content-card__body">
              <p className="pre-wrap">{current.description || 'No description.'}</p>
              <div className="key-values">
                <div><span>Priority</span><strong><StatusBadge value={current.priority} /></strong></div>
                <div><span>Type</span><strong><TaskTypeChips task={current} /></strong></div>
                {current.sequence ? <div><span>Stage on post</span><strong>{current.sequence}</strong></div> : null}
                <div><span>Lead</span><strong>{current.assignedToId ? userLabel(current.assignedTo, resolveName(current.assignedToId)) : 'No lead'}</strong></div>
                <div>
                  <span>Approver</span>
                  <strong>
                    {current.approverId ? userLabel(current.approver, resolveName(current.approverId)) : <Badge tone="warning">Needs an approver</Badge>}
                    {approverIsInactive(current) ? <> <Badge tone="danger">Deactivated</Badge></> : null}
                  </strong>
                </div>
                {current.startedAt ? <div><span>Started</span><strong>{formatDateTime(current.startedAt)}</strong></div> : null}
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
              <CommentsList
                loading={comments.loading}
                error={comments.error}
                data={comments.data}
                onRetry={comments.refetch}
                resolveName={resolveName}
                currentUserId={actorId}
              />

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
          {current.isDraft ? null : (
            <TaskReviewPanel
              companyId={companyId}
              task={current}
              members={members.data ?? []}
              membersLoading={members.loading}
              onTask={task.setData}
              onActivity={() => void logs.refetch()}
            />
          )}

          <Card>
            <CardHeader title="Status" />
            <div className="content-card__body">
              {current.isDraft ? <p className="muted">Publish this draft to start moving it through the board.</p> : (
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
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Cancel this task?',
                          message: `It leaves ${userLabel(current.approver, 'the approver')}'s queue and the waiting clock is cleared. The task is kept, marked Canceled.`,
                          confirmLabel: 'Cancel task',
                          cancelLabel: 'Keep it',
                          tone: 'danger',
                        });
                        if (ok) void changeStatus(TaskStatus.CANCELED);
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
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="People"
              action={(
                <RoleGate permission="tasks:edit">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit people</Button>
                </RoleGate>
              )}
            />
            <div className="content-card__body">
              <TaskPeopleList task={current} resolveName={resolveName} />
            </div>
          </Card>

          <AttachmentsPanel
            companyId={companyId}
            parent={{ entityType: 'TASK', entityId: taskId }}
            subtitle="Briefs, drafts, exports — anyone on the task can add or open them."
            onChanged={() => void logs.refetch()}
          />

          <Card>
            <CardHeader title="Activity" />
            <div className="content-card__body">
              {logs.error ? (
                <ErrorState message={logs.error} onRetry={logs.refetch} />
              ) : (
                <Timeline
                  items={(logs.data ?? []).map((item) => ({ id: item.id, ...describeActivity(item, resolveName, lang), createdAt: item.createdAt }))}
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
function describeActivity(log: TaskActivityLog, resolveName: (id?: string | null) => string, lang: AppLanguage): { title: string; body?: string } {
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
    case 'ASSIGNEES_CHANGED': {
      const { added, removed } = readAssigneeChanges(meta);
      const list = (rows: typeof added) => rows.map((row) => `${resolveName(row.userId)} (${taskRoleLabel(row.role, lang)})`).join(', ');
      const parts = [added.length ? `Added ${list(added)}` : null, removed.length ? `Removed ${list(removed)}` : null].filter(Boolean);
      return { title: 'People changed', body: parts.length ? parts.join(' · ') : undefined };
    }
    case 'ATTACHMENT_ADDED':
      return { title: 'Attachment added', body: attachmentSummary(meta) };
    case 'ATTACHMENT_REMOVED':
      return { title: 'Attachment removed', body: attachmentSummary(meta) };
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

/** A file's name, else a link's label or address: whichever the log row carries. */
function attachmentSummary(meta: Record<string, unknown>): string | undefined {
  for (const key of ['originalName', 'label', 'url']) {
    if (typeof meta[key] === 'string' && meta[key]) return meta[key] as string;
  }
  return undefined;
}

/** Previously `comments.data?.map()` with no empty and no error branch. */
function CommentsList({
  loading,
  error,
  data,
  onRetry,
  resolveName,
  currentUserId,
}: {
  loading: boolean;
  error: string | null;
  data: TaskComment[] | null;
  onRetry: () => void;
  /** Members lookup, for the common case where the API sends an author id and no object. */
  resolveName: (id?: string | null) => string;
  currentUserId: string | null;
}) {
  if (loading) return <p className="muted">Loading comments…</p>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data?.length) return <p className="muted">No comments yet.</p>;

  const authorName = (item: TaskComment) => {
    if (item.authorId && item.authorId === currentUserId) return 'You';
    return item.author?.fullName ?? item.author?.email ?? (item.authorId ? resolveName(item.authorId) : 'Team member');
  };

  return (
    <>
      {data.map((item) => (
        <div className="comment" key={item.id}>
          <strong>{authorName(item)}</strong>
          <p className="pre-wrap">{item.body || <span className="muted">(empty comment)</span>}</p>
          <time>{formatDateTime(item.createdAt)}</time>
        </div>
      ))}
    </>
  );
}
