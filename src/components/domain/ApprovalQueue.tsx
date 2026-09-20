import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { RequestChangesModal } from '@/components/domain/RequestChangesModal';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
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

/** A queue row knows its client, because the verdict is sent to that client's endpoint. */
export type QueueTask = Task & { clientId: string; clientName?: string };

/**
 * Everything in review that is waiting on the signed-in person, for one
 * client. Oldest submission first — the top row is the one keeping somebody
 * waiting — and each row can be decided without opening it.
 *
 * The cross-client page composes `ApprovalQueueList` with its own fan-out;
 * this component is the single-client case the Tasks page embeds.
 */
export function ApprovalQueue({ companyId, compact = false }: { companyId: string; compact?: boolean }) {
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [page]);

  const queue = useAsync(
    () => tasksService.approvalQueue(companyId, params),
    [companyId, page],
    { queryKey: queryKeys.approvalQueue(companyId, params) },
  );

  const rows = useMemo<QueueTask[]>(
    () => [...(queue.data?.items ?? [])].sort(byWaitingLongest).map((task) => ({ ...task, clientId: companyId })),
    [companyId, queue.data],
  );

  if (queue.loading) return <ListSkeleton rows={4} />;
  if (queue.error) return <Card><ErrorState message={queue.error} onRetry={queue.refetch} /></Card>;

  const total = queue.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ApprovalQueueList
      rows={rows}
      refreshing={queue.refreshing}
      emptyAction={compact ? undefined : <ButtonLink to={appRoutes.tasks} variant="secondary" size="sm">Open tasks</ButtonLink>}
      pagination={totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onPageChange={setPage} /> : null}
    />
  );
}

/**
 * The rows, with Approve / Request changes on each. Owns the verdict
 * handling; the caller only supplies the rows and where they came from.
 */
export function ApprovalQueueList({
  rows,
  refreshing = false,
  showClient = false,
  emptyTitle = 'Nothing waiting on you',
  emptyDescription = 'Tasks submitted to you for review show up here, oldest first.',
  emptyAction,
  pagination,
}: {
  rows: QueueTask[];
  refreshing?: boolean;
  /** Label each row with its client — the cross-client view. */
  showClient?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  pagination?: ReactNode;
}) {
  const [changesFor, setChangesFor] = useState<QueueTask | null>(null);
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

  const approve = async (task: QueueTask) => {
    setActingOn(task.id);
    const result = await review.approve(task.clientId, task.id);
    if (!result) setActingOn(null);
  };

  // One instant per render so two rows submitted a second apart do not straddle an hour boundary.
  const now = useMemo(() => Date.now(), [rows]);

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </Card>
    );
  }

  return (
    <>
      {refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
      <Card className="table-card">
        <ul className="queue-list" aria-label="Approval queue">
          {rows.map((task) => {
            const busy = actingOn === task.id;
            const stale = isWaitingLong(task.submittedForReviewAt, now);
            const overdue = isOverdue(task.dueDate);
            return (
              <li key={`${task.clientId}:${task.id}`} className={clsx('queue-row', stale && 'queue-row--stale')}>
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
                  {showClient && task.clientName ? <span className="client-tag">{task.clientName}</span> : null}
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
        {pagination}
      </Card>

      {review.error ? <p className="error-box" role="alert">{review.error}</p> : null}

      <RequestChangesModal
        task={changesFor}
        open={changesFor !== null}
        loading={review.requestingChanges}
        error={review.noteError}
        onClose={() => { setChangesFor(null); review.clearErrors(); }}
        onSubmit={(note) => (changesFor ? review.requestChanges(changesFor.clientId, changesFor.id, note) : Promise.resolve(null))}
      />
    </>
  );
}
