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
import { useLocale } from '@/context/LocaleContext';
import { errorCode, errorMessage, isConflict } from '@/lib/http';
import { tasksService } from '@/services/tasks';
import { TaskReviewErrorCode, TaskStatus, type Membership, type Task } from '@/types/domain';
import { formatDateTime } from '@/utils/format';
import { taskRoleLabel } from '@/utils/taskAssignees';
import { isStepEligible, isStepFlow, liveStep, stepActions, stepPosition } from '@/utils/taskSteps';
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

  if (isStepFlow(task)) {
    return <FlowReviewPanel companyId={companyId} task={task} members={members} membersLoading={membersLoading} onTask={onTask} onActivity={onActivity} />;
  }

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
            taskTypes={task.taskTypes ?? []}
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
  if (isStepFlow(task)) {
    const live = liveStep(task);
    if (!live?.reviewNote || live.status !== 'IN_PROGRESS') return null;
    return (
      <div className="review-note" role="status">
        <AlertIcon size={18} />
        <div>
          <p className="review-note__title">
            Changes requested on step {stepPosition(task, live).index} by {userLabel(live.approver, 'the approver')}
            {live.reviewedAt ? <span className="muted"> · {formatDateTime(live.reviewedAt)}</span> : null}
          </p>
          <p className="pre-wrap">{live.reviewNote}</p>
        </div>
      </div>
    );
  }
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

/**
 * The review card on a task that runs as a flow of steps (release guide 3.5).
 *
 * It answers, in order: whose turn is it, who signs that step off, and what
 * can *I* do. Start and Submit are offered only to the live step's person;
 * Approve and Request changes only to its approver. Everybody else sees where
 * the flow stands — the API answers them 403 NOT_YOUR_STEP anyway.
 */
function FlowReviewPanel({
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
  onTask: (task: Task) => void;
  onActivity?: () => void;
}) {
  const actor = useTaskActor();
  const { lang } = useLocale();
  const [changesOpen, setChangesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const review = useTaskReview({
    onTask: (next) => {
      onTask(next);
      onActivity?.();
      setChangesOpen(false);
    },
    onConflict: () => setChangesOpen(false),
  });

  const start = useMutation(tasksService.setStatus, {
    invalidateKeys: [['companies', companyId, 'tasks']],
    onError: (error) => {
      // Not your turn any more, or somebody moved the flow on: show where it stands now.
      if (isConflict(error) || errorCode(error) === TaskReviewErrorCode.NOT_YOUR_STEP) {
        toast.error('The flow has moved on. Refreshing…');
        void tasksService.get(companyId, task.id).then(onTask).catch(() => undefined);
        return;
      }
      setStartError(errorMessage(error));
    },
  });

  const changeApprover = useMutation(tasksService.update, {
    invalidateKeys: [['companies', companyId, 'tasks']],
  });

  const live = liveStep(task);
  const actions = stepActions(task, actor.userId);
  const position = live ? stepPosition(task, live) : null;
  const liveName = live ? userLabel(live.user ?? task.assignedTo, 'Somebody') : '';
  const liveApprover = live?.approverId ? userLabel(live.approver ?? task.approver, 'the approver') : null;

  const onStart = async () => {
    setStartError(null);
    const result = await start.mutate(companyId, task.id, TaskStatus.IN_PROGRESS);
    if (result) {
      onTask(result);
      onActivity?.();
      toast.success('Your step has started. The clock is running.');
    }
  };

  const setApprover = async (approverId: string) => {
    if ((approverId || null) === (live?.approverId ?? null)) return;
    // On a flow, `approverId` re-routes the live step only.
    const result = await changeApprover.mutate(companyId, task.id, { approverId: approverId || null });
    if (result) {
      onTask(result);
      onActivity?.();
      setPickerOpen(false);
      toast.success(approverId ? `${userLabel(liveStep(result)?.approver ?? result.approver)} now approves this step.` : 'This step no longer needs an approval.');
    }
  };

  const waiting = live?.status === 'IN_REVIEW';

  return (
    <Card className={waiting ? 'review-panel review-panel--waiting' : 'review-panel'}>
      <CardHeader
        title="Current step"
        action={waiting ? <Badge tone={isWaitingLong(live?.submittedAt ?? task.submittedForReviewAt) ? 'warning' : 'info'}>Waiting {formatWaiting(live?.submittedAt ?? task.submittedForReviewAt)}</Badge> : undefined}
      />
      <div className="content-card__body stack-list">
        {task.status === TaskStatus.DONE ? (
          <div className="review-status review-status--done">
            <CheckIcon size={16} />
            <p>Every step is done{task.completedAt ? <> · {formatDateTime(task.completedAt)}</> : null}.</p>
          </div>
        ) : task.status === TaskStatus.CANCELED ? (
          <p className="muted">This task was cancelled. Its steps are kept as history.</p>
        ) : live && position ? (
          <>
            <div className="review-approver">
              <span className="review-approver__label">Step {position.index} of {position.count}</span>
              <div className="review-approver__value">
                <strong>{liveName}</strong>
                <span className="muted">{taskRoleLabel(live.role, lang)}</span>
              </div>
            </div>
            <div className="review-approver">
              <span className="review-approver__label">Approver</span>
              <div className="review-approver__value">
                {liveApprover ? <strong>{liveApprover}</strong> : <span className="muted">None — done when submitted</span>}
                {actor.canChangeApprover && !pickerOpen ? <button type="button" className="link-button" onClick={() => setPickerOpen(true)}>Change</button> : null}
              </div>
            </div>
            {pickerOpen ? (
              <ApproverPicker
                id="step-approver-change"
                companyId={companyId}
                taskTypes={task.taskTypes ?? []}
                members={members.filter((member) => isStepEligible(member) && member.userId !== live.userId)}
                value={live.approverId ?? ''}
                onChange={setApprover}
                disabled={changeApprover.loading || membersLoading}
                error={changeApprover.error ?? undefined}
                autoResolve={false}
                label="Approver for this step"
              />
            ) : null}
            {waiting ? (
              <div className="review-status">
                <ClockIcon size={16} />
                <p>With <strong>{liveApprover}</strong>{live.submittedAt ? <> · submitted {formatDateTime(live.submittedAt)}</> : null}</p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">No step is live yet.</p>
        )}

        {actions.canReview ? (
          <div className="review-actions">
            <Button onClick={() => review.approve(companyId, task.id)} loading={review.approving} disabled={review.requestingChanges}>
              <CheckIcon size={16} /> Approve step
            </Button>
            <Button variant="secondary" onClick={() => setChangesOpen(true)} disabled={review.busy}>
              Request changes
            </Button>
          </div>
        ) : null}

        {actions.canStart || actions.canSubmit ? (
          <div className="review-actions">
            {actions.canStart ? (
              <Button onClick={() => void onStart()} loading={start.loading} disabled={review.busy}>Start my step</Button>
            ) : null}
            {actions.canSubmit ? (
              <Button
                variant={actions.canStart ? 'secondary' : 'primary'}
                onClick={() => review.submit(companyId, task.id)}
                loading={review.submitting}
                disabled={start.loading}
              >
                {live?.approverId ? 'Submit for review' : 'Mark my step done'}
              </Button>
            ) : null}
            <p className="muted">
              {live?.approverId
                ? <>Submitting hands your step to {liveApprover}. The next person is told once they approve.</>
                : <>This step has no approver: submitting finishes it and tells the next person.</>}
            </p>
          </div>
        ) : null}

        {startError || review.error ? <p className="error-box" role="alert">{startError ?? review.error}</p> : null}
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
