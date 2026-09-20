import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { RequestChangesModal } from '@/components/domain/RequestChangesModal';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';
import { CheckIcon } from '@/components/ui/icons';
import { useAsync } from '@/hooks/useAsync';
import { useTaskReview } from '@/hooks/useTaskReview';
import { queryKeys } from '@/lib/queryClient';
import { tasksService } from '@/services/tasks';
import { appRoutes } from '@/config/appRoutes';
import type { Task } from '@/types/domain';
import { formatDateTime, humanize } from '@/utils/format';
import { byWaitingLongest, formatWaiting, isWaitingLong, userLabel } from '@/utils/taskReview';
import { isOverdue } from '@/utils/workflow';

const PAGE_SIZE = 25;

/**
 * Everything in review that is waiting on the signed-in person, for one
 * client. Oldest submission first — the top row is the one keeping somebody
 * waiting — and each row can be decided without opening it.
 *
 * Per client by design: the endpoint is scoped to a `companyId`, and a
 * cross-client queue is a backend follow-up rather than a fan-out here.
 */
export function ApprovalQueue({ companyId, compact = false }: { companyId: string; compact?: boolean }) {
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [page]);

  const queue = useAsync(
    () => tasksService.approvalQueue(companyId, params),
    [companyId, page],
    { queryKey: queryKeys.approvalQueue(companyId, params) },
  );

  const [changesFor, setChangesFor] = useState<Task | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const review = useTaskReview({
    onTask: () => {
      setChangesFor(null);
      setActingOn(null);
    },
    onConflict: () => {
      setChangesFor(null);
      setActingOn(null);
    },
  });

  const approve = async (task: Task) => {
    setActingOn(task.id);
    const result = await review.approve(companyId, task.id);
    if (!result) setActingOn(null);
  };

  // One instant per render so two rows submitted a second apart do not straddle an hour boundary.
  const now = useMemo(() => Date.now(), [queue.data]);

  if (queue.loading) return <Card><LoadingState label="Loading your approval queue…" /></Card>;
  if (queue.error) return <Card><ErrorState message={queue.error} onRetry={queue.refetch} /></Card>;

  // The API already orders oldest first; sorting again costs nothing and protects the promise.
  const rows = [...(queue.data?.items ?? [])].sort(byWaitingLongest);
  const total = queue.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing waiting on you"
          description="Tasks submitted to you for review show up here, oldest first."
          action={compact ? undefined : <ButtonLink to={appRoutes.tasks} variant="secondary" size="sm">Open tasks</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <>
      {queue.refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
      <Card className="table-card">
        <ul className="queue-list" aria-label="Approval queue">
          {rows.map((task) => {
            const busy = actingOn === task.id;
            const stale = isWaitingLong(task.submittedForReviewAt, now);
            const overdue = isOverdue(task.dueDate);
            return (
              <li key={task.id} className={clsx('queue-row', stale && 'queue-row--stale')}>
                <div className="queue-row__wait" aria-label={`Waiting ${formatWaiting(task.submittedForReviewAt, now)}`}>
                  <strong>{formatWaiting(task.submittedForReviewAt, now)}</strong>
                  <span>waiting</span>
                </div>

                <div className="queue-row__main">
                  <Link className="queue-row__title" to={appRoutes.task(task.id)}>{task.title}</Link>
                  <p className="queue-row__meta">
                    <span>{humanize(task.type)}</span>
                    <span aria-hidden="true">·</span>
                    <span>by {userLabel(task.assignedTo, 'unassigned')}</span>
                    {task.submittedForReviewAt ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>submitted {formatDateTime(task.submittedForReviewAt)}</span>
                      </>
                    ) : null}
                    {task.dueDate ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={overdue ? 'danger-text' : undefined}>{overdue ? 'was due' : 'due'} {formatDateTime(task.dueDate)}</span>
                      </>
                    ) : null}
                  </p>
                  {task.description ? <p className="queue-row__description">{task.description}</p> : null}
                </div>

                <div className="queue-row__tags">
                  <StatusBadge value={task.priority} />
                  {stale ? <Badge tone="warning">Over a day</Badge> : null}
                </div>

                <div className="queue-row__actions">
                  <Button size="sm" onClick={() => approve(task)} loading={busy && review.approving} disabled={review.busy && !busy}>
                    <CheckIcon size={14} /> Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setChangesFor(task)} disabled={review.busy}>
                    Request changes
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onPageChange={setPage} /> : null}
      </Card>

      {review.error ? <p className="error-box" role="alert">{review.error}</p> : null}

      <RequestChangesModal
        task={changesFor}
        open={changesFor !== null}
        loading={review.requestingChanges}
        error={review.noteError}
        onClose={() => { setChangesFor(null); review.clearErrors(); }}
        onSubmit={(note) => (changesFor ? review.requestChanges(companyId, changesFor.id, note) : Promise.resolve(null))}
      />
    </>
  );
}
