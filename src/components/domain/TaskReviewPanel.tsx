import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApproverPicker } from '@/components/domain/ApproverPicker';
import { RequestChangesModal } from '@/components/domain/RequestChangesModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StepStatusBadge } from '@/components/domain/TaskPeople';
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
import { adminStepActions, isStepEligible, isStepFlow, liveStep, myPart, stepActions, stepPosition } from '@/utils/taskSteps';
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
 * The approver's note, pinned above the task while it is reworked. On a flow
 * the note lives on the people who were sent back: you see your own; anybody
 * else sees who it went back to.
 */
export function ReviewNoteBanner({ task }: { task: Task }) {
  const { userId } = useTaskActor();
  if (isStepFlow(task)) {
    const live = liveStep(task);
    const reworking = live?.assignees.filter((person) => person.status === 'IN_PROGRESS' && person.reviewNote) ?? [];
    if (!live || !reworking.length) return null;
    const mine = reworking.find((person) => person.userId === userId);
    const shown = mine ?? reworking[0];
    return (
      <div className="review-note" role="status">
        <AlertIcon size={18} />
        <div>
          <p className="review-note__title">
            Changes requested on step {stepPosition(task, live).index} by {userLabel(live.approver, 'the approver')}
            {mine ? null : <> · sent back to {reworking.map((person) => userLabel(person.user, 'a teammate')).join(', ')}</>}
            {shown.reviewedAt ? <span className="muted"> · {formatDateTime(shown.reviewedAt)}</span> : null}
          </p>
          <p className="pre-wrap">{shown.reviewNote}</p>
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

type ActFor = { action: 'start' | 'submit'; userIds: string[] };

/**
 * The review card on a task that runs as a flow of steps (parallel-steps
 * guide 1.5, 1.9).
 *
 * It answers, in order: which step is live and who is on it, who signs it
 * off, and what can *I* do. Start and Submit are based on your OWN part of the
 * live step: TODO → Start, TODO / IN_PROGRESS → Submit, SUBMITTED → waiting
 * for teammates. Approve and Request changes go to the step's approver (or an
 * admin) once everybody is in. An admin who is not on the step may press
 * Start or Submit for somebody; on a shared step the API answers 409
 * STEP_ASSIGNEE_REQUIRED and the card asks for whom.
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actFor, setActFor] = useState<ActFor | null>(null);

  const live = liveStep(task);
  const mine = myPart(task, actor.userId);
  const actions = stepActions(task, actor.userId, actor.isAdmin);
  // An admin not on the step may press for somebody who can take the action.
  const forOthers = actor.isAdmin && !mine ? adminStepActions(task) : { canStart: false, canSubmit: false };
  const position = live ? stepPosition(task, live) : null;
  const shared = (live?.assignees.length ?? 0) > 1;
  const liveApprover = live?.approverId ? userLabel(live.approver ?? task.approver, 'the approver') : null;
  const nameOf = (userId: string) => userLabel(live?.assignees.find((person) => person.userId === userId)?.user, 'Somebody');

  const review = useTaskReview({
    onTask: (next) => {
      onTask(next);
      onActivity?.();
      setChangesOpen(false);
      setActFor(null);
    },
    onConflict: () => { setChangesOpen(false); setActFor(null); },
    onAssigneeRequired: (userIds) => setActFor({ action: 'submit', userIds }),
  });

  const start = useMutation(tasksService.setStatus, {
    invalidateKeys: [['companies', companyId, 'tasks']],
    onError: (error) => {
      const code = errorCode(error);
      if (code === TaskReviewErrorCode.STEP_ASSIGNEE_REQUIRED) {
        setActFor({ action: 'start', userIds: (error as { userIds?: string[] }).userIds ?? [] });
        return;
      }
      // Not your turn any more, or somebody moved the flow on: show where it stands now.
      if (isConflict(error) || code === TaskReviewErrorCode.NOT_YOUR_STEP || code === TaskReviewErrorCode.NOT_IN_STEP) {
        toast.error('The flow has moved on. Refreshing…');
        setActFor(null);
        void tasksService.get(companyId, task.id).then(onTask).catch(() => undefined);
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const changeApprover = useMutation(tasksService.update, {
    invalidateKeys: [['companies', companyId, 'tasks']],
  });

  const onStart = async (onBehalfOfUserId?: string) => {
    setActionError(null);
    const result = await start.mutate(companyId, task.id, TaskStatus.IN_PROGRESS, undefined, onBehalfOfUserId);
    if (result) {
      onTask(result);
      onActivity?.();
      setActFor(null);
      toast.success(onBehalfOfUserId ? `${nameOf(onBehalfOfUserId)}'s part has started.` : 'Your part has started. The clock is running.');
    }
  };

  const onSubmit = (onBehalfOfUserId?: string) => {
    setActionError(null);
    void review.submit(companyId, task.id, onBehalfOfUserId, live?.stepOrder);
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
  const waitingSince = waiting ? task.submittedForReviewAt : null;
  // A step with its approver must keep one (guide 1.3); only a working step may drop it.
  const canClearApprover = !waiting;

  return (
    <Card className={waiting ? 'review-panel review-panel--waiting' : 'review-panel'}>
      <CardHeader
        title="Current step"
        action={waiting ? <Badge tone={isWaitingLong(waitingSince) ? 'warning' : 'info'}>Waiting {formatWaiting(waitingSince)}</Badge> : undefined}
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
              <span className="review-approver__label">
                Step {position.index} of {position.count}
                {shared ? <> · {live.submittedCount} of {live.assigneeCount} submitted</> : null}
              </span>
              <ul className="current-step-people">
                {live.assignees.map((person) => (
                  <li key={person.id}>
                    <strong>{userLabel(person.user, 'Somebody')}</strong>
                    <span className="muted"> {taskRoleLabel(person.role, lang)}</span>
                    {shared ? <> <StepStatusBadge status={person.status} /></> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="review-approver">
              <span className="review-approver__label">Approver</span>
              <div className="review-approver__value">
                {liveApprover ? <strong>{liveApprover}</strong> : <span className="muted">{shared ? 'None — done when everybody submits' : 'None — done when submitted'}</span>}
                {actor.canChangeApprover && !pickerOpen ? <button type="button" className="link-button" onClick={() => setPickerOpen(true)}>Change</button> : null}
              </div>
            </div>
            {pickerOpen ? (
              <ApproverPicker
                id="step-approver-change"
                companyId={companyId}
                taskTypes={task.taskTypes ?? []}
                members={members.filter((member) => isStepEligible(member) && !live.assignees.some((person) => person.userId === member.userId))}
                value={live.approverId ?? ''}
                onChange={(approverId) => {
                  if (!approverId && !canClearApprover) return;
                  void setApprover(approverId);
                }}
                disabled={changeApprover.loading || membersLoading}
                error={changeApprover.error ?? (!canClearApprover ? 'This step is with its approver: choose somebody else rather than nobody.' : undefined)}
                autoResolve={false}
                label="Approver for this step"
              />
            ) : null}
            {waiting ? (
              <div className="review-status">
                <ClockIcon size={16} />
                <p>{shared ? 'Everybody has submitted. ' : ''}With <strong>{liveApprover}</strong>{waitingSince ? <> · since {formatDateTime(waitingSince)}</> : null}</p>
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
            {live?.approverId !== actor.userId ? <p className="muted">You are acting as admin — the log records it under your name.</p> : null}
          </div>
        ) : null}

        {actions.canStart || actions.canSubmit ? (
          <div className="review-actions">
            {actions.canStart ? (
              <Button onClick={() => void onStart()} loading={start.loading && !actFor} disabled={review.busy}>Start my part</Button>
            ) : null}
            {actions.canSubmit ? (
              <Button variant={actions.canStart ? 'secondary' : 'primary'} onClick={() => onSubmit()} loading={review.submitting && !actFor} disabled={start.loading}>
                {shared ? 'Hand in my part' : live?.approverId ? 'Submit for review' : 'Mark my step done'}
              </Button>
            ) : null}
            <p className="muted">
              {shared
                ? live?.approverId
                  ? <>The step goes to {liveApprover} once everybody on it has handed in.</>
                  : <>The step finishes, and the next one starts, once everybody on it has handed in.</>
                : live?.approverId
                  ? <>Submitting hands your step to {liveApprover}. The next person is told once they approve.</>
                  : <>This step has no approver: submitting finishes it and tells the next person.</>}
            </p>
          </div>
        ) : null}

        {actions.waitingForTeammates ? (
          <div className="review-status">
            <ClockIcon size={16} />
            <p>Your part is in. Waiting for teammates: {live?.assignees.filter((person) => person.status === 'TODO' || person.status === 'IN_PROGRESS').map((person) => userLabel(person.user, 'a teammate')).join(', ')}.</p>
          </div>
        ) : null}

        {forOthers.canStart || forOthers.canSubmit ? (
          <div className="review-actions">
            {forOthers.canStart ? (
              <Button variant="secondary" onClick={() => void onStart()} loading={start.loading && !actFor} disabled={review.busy}>Start a part…</Button>
            ) : null}
            {forOthers.canSubmit ? (
              <Button variant="secondary" onClick={() => onSubmit()} loading={review.submitting && !actFor} disabled={start.loading}>Hand in a part…</Button>
            ) : null}
            <p className="muted">You are not on this step. As admin you can act for somebody on it; the log records it under your name.</p>
          </div>
        ) : null}

        {actionError || review.error ? <p className="error-box" role="alert">{actionError ?? review.error}</p> : null}
      </div>

      <RequestChangesModal
        task={task}
        open={changesOpen}
        loading={review.requestingChanges}
        error={review.noteError}
        people={shared ? live?.assignees.map((person) => ({ userId: person.userId, name: userLabel(person.user, 'Somebody'), role: taskRoleLabel(person.role, lang) })) : undefined}
        onClose={() => { setChangesOpen(false); review.clearErrors(); }}
        onSubmit={(note, userIds) => review.requestChanges(companyId, task.id, note, userIds)}
      />

      <ActForPicker
        request={actFor}
        nameOf={nameOf}
        loading={start.loading || review.submitting}
        onCancel={() => setActFor(null)}
        onChoose={(userId) => (actFor?.action === 'start' ? void onStart(userId) : onSubmit(userId))}
      />
    </Card>
  );
}

/**
 * The API's 409 STEP_ASSIGNEE_REQUIRED, answered: an admin pressed Start or
 * Hand in on a shared step, and the API needs to know whose part it is.
 */
function ActForPicker({
  request,
  nameOf,
  loading,
  onCancel,
  onChoose,
}: {
  request: ActFor | null;
  nameOf: (userId: string) => string;
  loading: boolean;
  onCancel: () => void;
  onChoose: (userId: string) => void;
}) {
  const [chosen, setChosen] = useState('');
  const userIdsKey = request?.userIds.join(',') ?? '';
  useEffect(() => setChosen(userIdsKey.split(',')[0] ?? ''), [userIdsKey]);
  const verb = request?.action === 'start' ? 'Start' : 'Hand in';

  return (
    <Modal
      open={Boolean(request)}
      title={`${verb} whose part?`}
      onClose={loading ? () => undefined : onCancel}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button type="button" loading={loading} disabled={!chosen} onClick={() => onChoose(chosen)}>{verb} for {chosen ? nameOf(chosen) : '…'}</Button>
        </>
      )}
    >
      <fieldset className="checkbox-group">
        <legend className="field__label">Several people on this step could take it</legend>
        {request?.userIds.map((userId) => (
          <label key={userId} className="checkbox-row">
            <input type="radio" name="act-for" value={userId} checked={chosen === userId} onChange={() => setChosen(userId)} />
            <span>{nameOf(userId)}</span>
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}
