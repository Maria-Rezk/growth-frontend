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
 * this post, so the Account Manager never retypes the title.
 *
 * Automatic chaining (stage 2 blocked until stage 1 is approved, the post
 * moving to READY_FOR_CLIENT when the last gate passes) is a backend
 * `sequence` field the guide lists as a separate ticket. This panel is
 * what that ticket will drive; until then, the order is advisory.
 */
export function PostWorkPanel({ companyId, post }: { companyId: string; post: ContentPost }) {
  const tasks = useAsync(() => tasksService.list(companyId), [companyId], { queryKey: queryKeys.tasks(companyId) });
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });
  const [createLink, setCreateLink] = useState<TaskLink | null>(null);

  const linked = useMemo(() => {
    const rows = (tasks.data ?? []).filter((task) => task.relatedEntityType?.toUpperCase() === 'POST' && task.relatedEntityId === post.id);
    return rows.sort((a, b) => stageIndex(a.type) - stageIndex(b.type) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }, [post.id, tasks.data]);

  const nextStage = useMemo(() => suggestNext(linked), [linked]);
  const done = linked.filter((task) => task.status === TaskStatus.DONE).length;

  return (
    <Card className="content-card">
      <CardHeader
        title="Work on this post"
        subtitle={linked.length ? `${done} of ${linked.length} stages done.` : 'Copy, design, review and publishing — each stage is a task with its own approver.'}
        action={(
          <RoleGate permission="tasks:manage">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCreateLink({ relatedEntityType: 'POST', relatedEntityId: post.id, label: post.title, type: nextStage })}
            >
              <PlusIcon size={14} /> {nextStage ? `Add ${humanize(nextStage).toLowerCase()} stage` : 'Add task'}
            </Button>
          </RoleGate>
        )}
      />
      <div className="content-card__body">
        {tasks.loading ? <ListSkeleton rows={3} /> : null}
        {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.refetch} /> : null}
        {tasks.data && linked.length === 0 ? (
          <p className="muted">No task is attached to this post yet. Add the first stage and it routes through the responsibility matrix.</p>
        ) : null}
        {linked.length ? (
          <ol className="stage-list">
            {linked.map((task, index) => (
              <li key={task.id} className={clsx('stage', `stage--${stageTone(task)}`)}>
                <span className="stage__marker" aria-hidden="true">
                  {task.status === TaskStatus.DONE ? <CheckIcon size={12} /> : isInReview(task) ? <ClockIcon size={12} /> : index + 1}
                </span>
                <div className="stage__main">
                  <Link className="table-link" to={appRoutes.task(task.id)}>{task.title}</Link>
                  <p className="muted">
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
        key={createLink?.type ?? 'none'}
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

/** The first stage this post does not have yet, in pipeline order. */
function suggestNext(linked: Task[]): TaskType | undefined {
  const have = new Set(linked.map((task) => task.type));
  return STAGES.find((stage) => !have.has(stage));
}

function stageTone(task: Task): 'done' | 'review' | 'active' | 'idle' {
  if (task.status === TaskStatus.DONE) return 'done';
  if (isInReview(task)) return 'review';
  if (task.status === TaskStatus.IN_PROGRESS) return 'active';
  return 'idle';
}
