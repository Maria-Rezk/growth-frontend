import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/State';
import { CheckIcon, ClockIcon, PlusIcon } from '@/components/ui/icons';
import { appRoutes } from '@/config/appRoutes';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { companiesService } from '@/services/companies';
import { tasksService } from '@/services/tasks';
import { TaskModal, type TaskLink } from '@/pages/TasksPage';
import { TaskStatus, TaskType, type ContentPost, type Task } from '@/types/domain';
import { formatDate, humanize } from '@/utils/format';
import { formatWaiting, isInReview, needsApprover, userLabel } from '@/utils/taskReview';

/*
  The stages a post normally goes through, in order. Used to sort the
  post's tasks into a pipeline and to suggest the next one: after copy comes
  design, after design comes publishing. Anything else (GENERAL, FOLLOW_UP)
  is listed after the stages, not lost.
*/
const STAGES: TaskType[] = [TaskType.COPYWRITING, TaskType.DESIGN, TaskType.CLIENT_REVIEW, TaskType.PUBLISHING];

/**
 * The work behind a post, as a pipeline.
 *
 * Copy → design → client review → publishing, each a task with its own
 * assignee, approver and review state, read from the task list by
 * `relatedEntityId`. "Add the next stage" creates the task pre-linked to
 * this post with the next stage number.
 *
 * Tasks with a `sequence` are gated by the API: a stage cannot be submitted
 * for review while a lower one is open, and the post cannot go to the client
 * while any is open. Progress comes from the post's `stages` (the server's
 * count, which leaves cancelled stages out); the post never moves on its own.
 */
export function PostWorkPanel({ companyId, post }: { companyId: string; post: ContentPost }) {
  const tasks = useAsync(() => tasksService.list(companyId), [companyId], { queryKey: queryKeys.tasks(companyId) });
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });
  const [createLink, setCreateLink] = useState<TaskLink | null>(null);

  const linked = useMemo(() => {
    const rows = (tasks.data ?? []).filter((task) => task.relatedEntityType?.toUpperCase() === 'POST' && task.relatedEntityId === post.id);
    // Sequenced stages first, in their order; unsequenced work after, by type.
    return rows.sort((a, b) =>
      (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER)
      || stageIndex(a.type) - stageIndex(b.type)
      || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }, [post.id, tasks.data]);

  const nextStage = useMemo(() => suggestNext(linked), [linked]);
  const nextSequence = useMemo(() => {
    const highest = Math.max(0, ...linked.map((task) => task.sequence ?? 0));
    return highest < 50 ? highest + 1 : undefined;
  }, [linked]);
  const stages = post.stages;
  const percent = stages?.total ? Math.round((stages.done / stages.total) * 100) : 0;

  return (
    <Card className="content-card">
      <CardHeader
        title="Work on this post"
        subtitle={stages?.total
          ? `${stages.done} of ${stages.total} stages done.${stages.open.length ? ' The post can go to the client once every stage is finished.' : ' Ready to go to the client.'}`
          : linked.length
            ? `${linked.filter((task) => task.status === TaskStatus.DONE).length} of ${linked.length} tasks done. Give tasks a stage number to make them run in order.`
            : 'Copy, design, review and publishing — each stage is a task with its own approver.'}
        action={(
          <RoleGate permission="tasks:manage">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCreateLink({ relatedEntityType: 'POST', relatedEntityId: post.id, label: post.title, type: nextStage, sequence: nextSequence })}
            >
              <PlusIcon size={14} /> {nextStage ? `Add ${humanize(nextStage).toLowerCase()} stage` : 'Add task'}
            </Button>
          </RoleGate>
        )}
      />
      <div className="content-card__body">
        {stages?.total ? (
          <div
            className="progress"
            role="progressbar"
            aria-label="Stages done"
            aria-valuemin={0}
            aria-valuemax={stages.total}
            aria-valuenow={stages.done}
            aria-valuetext={`${stages.done} of ${stages.total} stages done`}
          >
            <div className="progress__bar" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        {tasks.loading ? <ListSkeleton rows={3} /> : null}
        {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.refetch} /> : null}
        {tasks.data && linked.length === 0 ? (
          <p className="muted">No task is attached to this post yet. Add the first stage and it routes through the responsibility matrix.</p>
        ) : null}
        {linked.length ? (
          <ol className="stage-list">
            {linked.map((task) => (
              <li key={task.id} className={clsx('stage', `stage--${stageTone(task)}`)}>
                <span className="stage__marker" aria-hidden="true">
                  {task.status === TaskStatus.DONE ? <CheckIcon size={12} /> : isInReview(task) ? <ClockIcon size={12} /> : task.sequence ?? '•'}
                </span>
                <div className="stage__main">
                  <Link className="table-link" to={appRoutes.task(task.id)}>{task.title}</Link>
                  <p className="muted">
                    {task.sequence ? <>Stage {task.sequence} · </> : null}
                    {humanize(task.type)}
                    {task.assignedTo ? <> · {userLabel(task.assignedTo)}</> : <> · unassigned</>}
                    {task.approverId ? <> · approver {userLabel(task.approver)}</> : null}
                    {task.dueDate ? <> · due {formatDate(task.dueDate)}</> : null}
                  </p>
                </div>
                <div className="stage__state">
                  {needsApprover(task) ? <Badge tone="warning">Needs an approver</Badge> : null}
                  {isInReview(task) && !needsApprover(task) ? <Badge tone="info">Waiting {formatWaiting(task.submittedForReviewAt)}</Badge> : null}
                  {task.reviewNote && !isInReview(task) && task.status !== TaskStatus.DONE ? <Badge tone="warning">Changes requested</Badge> : null}
                  <StatusBadge value={task.status} />
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <TaskModal
        key={createLink ? `${createLink.type ?? 'task'}-${createLink.sequence ?? ''}` : 'none'}
        open={createLink !== null}
        companyId={companyId}
        onClose={() => setCreateLink(null)}
        members={members.data ?? []}
        link={createLink ?? undefined}
        onCreated={() => void tasks.refetch()}
      />
    </Card>
  );
}

function stageIndex(type: TaskType): number {
  const index = STAGES.indexOf(type);
  return index === -1 ? STAGES.length : index;
}

/**
 * The first stage this post does not have yet, in pipeline order — and, once
 * stages are numbered, only one that comes after the last numbered stage, so
 * "Add copywriting stage" is never offered as stage 2 behind the design.
 */
function suggestNext(linked: Task[]): TaskType | undefined {
  const have = new Set(linked.map((task) => task.type));
  const last = linked.reduce<Task | undefined>((top, task) => ((task.sequence ?? 0) > (top?.sequence ?? 0) ? task : top), undefined);
  const after = last?.sequence ? STAGES.indexOf(last.type) : -1;
  return STAGES.find((stage, index) => !have.has(stage) && index > after);
}

function stageTone(task: Task): 'done' | 'review' | 'active' | 'idle' {
  if (task.status === TaskStatus.DONE) return 'done';
  if (isInReview(task)) return 'review';
  if (task.status === TaskStatus.IN_PROGRESS) return 'active';
  return 'idle';
}
