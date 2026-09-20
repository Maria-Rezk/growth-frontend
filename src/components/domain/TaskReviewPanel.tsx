import { useState } from 'react';
import toast from 'react-hot-toast';
import { ApproverPicker } from '@/components/domain/ApproverPicker';
import { RequestChangesModal } from '@/components/domain/RequestChangesModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { AlertIcon, CheckIcon, ClockIcon } from '@/components/ui/icons';
import { useMutation } from '@/hooks/useAsync';
import { useTaskActor } from '@/hooks/useTaskActor';
import { useTaskReview } from '@/hooks/useTaskReview';
import { tasksService } from '@/services/tasks';
import { TaskStatus, type Membership, type Task } from '@/types/domain';
import { formatDateTime } from '@/utils/format';
import {
  approverIsInactive,
  canReview,
  canSubmitForReview,
  formatWaiting,
  isInReview,
  isWaitingLong,
  userLabel,
} from '@/utils/taskReview';

/**
 * The review card on a task.
 *
 * One card answers three questions in order: who approves this, where is it
 * in the review, and what can *I* do about it. The buttons are the only way
 * into and out of `IN_REVIEW` — the status control refuses that value.
 */
export function TaskReviewPanel({
  companyId,
  task,
  members,
  membersLoading,
  onTask,
  onActivity,
}: {
  companyId: string;
  task: Task;
  members: Membership[];
  membersLoading?: boolean;
  /** The task the API returned after an action. */
  onTask: (task: Task) => void;
  /** Something was written to the activity log. */
  onActivity?: () => void;
}) {
  const actor = useTaskActor();
  const [changesOpen, setChangesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const review = useTaskReview({
    onTask: (next) => {
      onTask(next);
      onActivity?.();
      setChangesOpen(false);
    },
    onConflict: () => setChangesOpen(false),
    // The one 422 a person can fix on the spot: open the picker for them.
    onApproverRequired: () => setPickerOpen(true),
  });

  const changeApprover = useMutation(tasksService.update, {
    invalidateKeys: [['companies', companyId, 'tasks']],
  });

  const setApprover = async (approverId: string) => {
    if ((approverId || null) === (task.approverId ?? null)) return;
    const result = await changeApprover.mutate(companyId, task.id, { approverId: approverId || null });
    if (result) {
      onTask(result);
      onActivity?.();
      review.clearErrors();
      toast.success(approverId ? `${userLabel(result.approver)} now approves this task.` : 'Approver cleared.');
    }
  };

  const inReview = isInReview(task);
  const submittable = canSubmitForReview(task, actor);
  const reviewer = canReview(task, actor);
  // Re-routing only makes sense while there is still something to approve.
  const closed = task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELED;
  const showPicker = actor.canChangeApprover && !closed && (pickerOpen || !task.approverId);

  return (
    <Card className={inReview ? 'review-panel review-panel--waiting' : 'review-panel'}>
      <CardHeader
        title="Review"
        action={inReview ? <Badge tone={isWaitingLong(task.submittedForReviewAt) ? 'warning' : 'info'}>Waiting {formatWaiting(task.submittedForReviewAt)}</Badge> : undefined}
      />
      <div className="content-card__body stack-list">
        <ApproverRow task={task} onChange={actor.canChangeApprover && !closed && !showPicker ? () => setPickerOpen(true) : undefined} />

        {showPicker ? (
          <ApproverPicker
            id="task-approver-change"
            companyId={companyId}
            taskType={task.type}
            members={members}
            value={task.approverId ?? ''}
            onChange={setApprover}
            disabled={changeApprover.loading || membersLoading}
            error={changeApprover.error ?? undefined}
            autoResolve={false}
            label={task.approverId ? 'Change approver' : 'Set an approver'}
          />
        ) : null}

        {inReview ? (
          <div className="review-status">
            <ClockIcon size={16} />
            <div>
              <p>
                Waiting on <strong>{userLabel(task.approver, 'an approver')}</strong>
                {task.submittedForReviewAt ? <> · submitted {formatDateTime(task.submittedForReviewAt)}</> : null}
              </p>
              {!task.approverId ? (
                <p className="danger-text">Nobody is named to approve this — it will wait until somebody is.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {inReview && reviewer ? (
          <div className="review-actions">
            <Button onClick={() => review.approve(companyId, task.id)} loading={review.approving} disabled={review.requestingChanges}>
              <CheckIcon size={16} /> Approve
            </Button>
            <Button variant="secondary" onClick={() => setChangesOpen(true)} disabled={review.busy}>
              Request changes
            </Button>
            {actor.isAdmin && !(task.approverId && task.approverId === actor.userId) ? (
              <p className="muted">You are acting as admin — the log records it under your name.</p>
            ) : null}
          </div>
        ) : null}

        {!inReview && submittable ? (
          <div className="review-actions">
            <Button
              onClick={() => review.submit(companyId, task.id)}
              loading={review.submitting}
              disabled={!task.approverId}
              title={task.approverId ? undefined : 'Set an approver first'}
            >
              Submit for review
            </Button>
            <p className="muted">
              {task.approverId
                ? <>Hands the task to {userLabel(task.approver)} and starts the waiting clock.</>
                : <>This task has no approver, so it cannot be submitted yet.</>}
            </p>
          </div>
        ) : null}

        {task.status === TaskStatus.DONE && task.reviewedAt ? (
          <div className="review-status review-status--done">
            <CheckIcon size={16} />
            <p>Approved by <strong>{userLabel(task.approver)}</strong> · {formatDateTime(task.reviewedAt)}</p>
          </div>
        ) : null}

        {review.error ? <p className="error-box" role="alert">{review.error}</p> : null}
      </div>

      <RequestChangesModal
        task={task}
        open={changesOpen}
        loading={review.requestingChanges}
        error={review.noteError}
        onClose={() => { setChangesOpen(false); review.clearErrors(); }}
        onSubmit={(note) => review.requestChanges(companyId, task.id, note)}
      />
    </Card>
  );
}

function ApproverRow({ task, onChange }: { task: Task; onChange?: () => void }) {
  const inactive = approverIsInactive(task);
  return (
    <div className="review-approver">
      <span className="review-approver__label">Approver</span>
      <div className="review-approver__value">
        {task.approverId ? (
          <>
            <strong>{userLabel(task.approver)}</strong>
            {inactive ? <Badge tone="danger">Deactivated</Badge> : null}
          </>
        ) : (
          <Badge tone="warning"><AlertIcon size={12} /> Needs an approver</Badge>
        )}
        {onChange ? <button type="button" className="link-button" onClick={onChange}>Change</button> : null}
      </div>
    </div>
  );
}

/**
 * The approver's last note, pinned above the task while the doer reworks it.
 * Only while the task is back with them — once it is re-submitted or done
 * the note is history, and history lives in the activity log.
 */
export function ReviewNoteBanner({ task }: { task: Task }) {
  if (!task.reviewNote) return null;
  if (task.status === TaskStatus.IN_REVIEW || task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELED) return null;
  return (
    <div className="review-note" role="status">
      <AlertIcon size={18} />
      <div>
        <p className="review-note__title">
          Changes requested by {userLabel(task.approver, 'the approver')}
          {task.reviewedAt ? <span className="muted"> · {formatDateTime(task.reviewedAt)}</span> : null}
        </p>
        <p className="pre-wrap">{task.reviewNote}</p>
      </div>
    </div>
  );
}
