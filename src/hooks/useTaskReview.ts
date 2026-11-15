import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useMutation } from '@/hooks/useAsync';
import { errorCode, errorMessage, isConflict } from '@/lib/http';
import { MY_WORK_KEY, queryKeys } from '@/lib/queryClient';
import { tasksService } from '@/services/tasks';
import { TaskReviewErrorCode, type Task } from '@/types/domain';
import { userLabel } from '@/utils/taskReview';
import { isStepFlow, liveStep } from '@/utils/taskSteps';

/** Who a step now waits on, in words: "Yasin", "Yasin and Amr", "3 people". */
function peopleLabel(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.length} people`;
}

/**
 * What a submit did, in words. On a flow it may have left the step waiting
 * for teammates, sent it to its approver, finished it, or finished the task.
 * `before` is the step number the part was handed in on.
 */
export function submittedMessage(task: Task, before?: number | null): string {
  if (!isStepFlow(task)) return `Sent to ${userLabel(task.approver, 'the approver')} for review.`;
  if (task.status === 'DONE') return 'Your part is in, and every step is done.';
  const live = liveStep(task);
  if (live && live.stepOrder === before) {
    if (live.status === 'IN_REVIEW') return `Everybody is in: sent to ${userLabel(live.approver ?? task.approver, 'the approver')} for review.`;
    const waiting = live.assignees.filter((person) => person.status === 'TODO' || person.status === 'IN_PROGRESS').map((person) => userLabel(person.user, 'a teammate'));
    return `Your part is in. Waiting for ${peopleLabel(waiting)} before it goes on.`;
  }
  const next = live?.assignees.map((person) => userLabel(person.user, 'the next person')) ?? [];
  return `Your step is done. ${next.length ? peopleLabel(next) : 'The next person'} ${next.length > 1 ? 'have' : 'has'} been told it is their turn.`;
}

/** What an approval did: on a flow it hands the task to the next step, or finishes it. */
export function approvedMessage(task: Task): string {
  if (!isStepFlow(task)) return `Approved "${task.title}".`;
  if (task.status === 'DONE') return 'Step approved. Every step is done.';
  const next = liveStep(task)?.assignees.map((person) => userLabel(person.user, 'the next person')) ?? [];
  return `Step approved. ${next.length ? peopleLabel(next) : 'The next person'} ${next.length > 1 ? 'have' : 'has'} been told it is their turn.`;
}

export type ReviewAction = 'submit' | 'approve' | 'changes';

interface Options {
  /** The task the API handed back — put it on screen. */
  onTask?: (task: Task, action: ReviewAction) => void;
  /**
   * A 409: somebody else already decided. The caller refreshes rather than
   * retrying — the second press would only get the same answer.
   */
  onConflict?: (companyId: string, taskId: string) => void;
  /** A 422 APPROVER_REQUIRED on submit: open the approver picker. */
  onApproverRequired?: (companyId: string, taskId: string) => void;
  /** A 409 STEP_ASSIGNEE_REQUIRED: an admin acted on a shared step; ask for whom (`userIds`) and resend. */
  onAssigneeRequired?: (userIds: string[], action: 'submit') => void;
}

/**
 * The three review actions with the error handling done once.
 *
 * The API answers with a `code`; this switches on it so no screen has to
 * parse a message. `noteError` is the one field-level outcome (an empty note
 * on request-changes); everything else is a toast or a callback.
 */
export function useTaskReview(options: Options = {}) {
  const queryClient = useQueryClient();
  const [noteError, setNoteError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  // The step a part was handed in on, so the toast can say what happened to it.
  const submittedStep = useRef<number | null>(null);

  const invalidate = useCallback(
    (companyId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['companies', companyId, 'tasks'] });
      void queryClient.invalidateQueries({ queryKey: MY_WORK_KEY });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifications });
    },
    [queryClient],
  );

  const handleError = useCallback(
    (error: unknown, companyId: string, taskId: string) => {
      const code = errorCode(error);
      // A 409, but not a race: an earlier stage on the post must finish first. The message names it.
      if (code === TaskReviewErrorCode.PREVIOUS_STAGE_OPEN) {
        setLastError(`${errorMessage(error)}. Finish or cancel that stage, then submit this one.`);
        return;
      }
      if (isConflict(error) || code === TaskReviewErrorCode.INVALID_TRANSITION || code === TaskReviewErrorCode.REVIEW_ACTIONS_ONLY) {
        toast.error('Somebody already acted on this task. Refreshing…');
        invalidate(companyId);
        options.onConflict?.(companyId, taskId);
        return;
      }
      // An admin pressed it on a shared step: say whose part, then send again.
      if (code === TaskReviewErrorCode.STEP_ASSIGNEE_REQUIRED) {
        options.onAssigneeRequired?.((error as { userIds?: string[] }).userIds ?? [], 'submit');
        return;
      }
      if (code === TaskReviewErrorCode.NOT_IN_STEP) {
        setLastError('Somebody named is no longer on this step. Refresh and choose again.');
        invalidate(companyId);
        return;
      }
      // Not this person's step any more: somebody moved the flow on. Same cure as a race.
      if (code === TaskReviewErrorCode.NOT_YOUR_STEP) {
        toast.error('This step is no longer yours to act on. Refreshing…');
        invalidate(companyId);
        options.onConflict?.(companyId, taskId);
        return;
      }
      if (code === TaskReviewErrorCode.APPROVER_REQUIRED) {
        setLastError(errorMessage(error));
        options.onApproverRequired?.(companyId, taskId);
        return;
      }
      if (code === TaskReviewErrorCode.REVIEW_NOTE_REQUIRED) {
        setNoteError(errorMessage(error));
        return;
      }
      setLastError(errorMessage(error));
    },
    [invalidate, options],
  );

  const submitMutation = useMutation(tasksService.submitForReview, {
    onSuccess: (task, [companyId]) => {
      invalidate(companyId);
      toast.success(submittedMessage(task, submittedStep.current));
      options.onTask?.(task, 'submit');
    },
    onError: (error, [companyId, taskId]) => handleError(error, companyId, taskId),
  });

  const approveMutation = useMutation(tasksService.approve, {
    onSuccess: (task, [companyId]) => {
      invalidate(companyId);
      toast.success(approvedMessage(task));
      options.onTask?.(task, 'approve');
    },
    onError: (error, [companyId, taskId]) => handleError(error, companyId, taskId),
  });

  const changesMutation = useMutation(tasksService.requestChanges, {
    onSuccess: (task, [companyId]) => {
      invalidate(companyId);
      toast.success(`Sent back to ${userLabel(task.assignedTo, 'the assignee')}.`);
      options.onTask?.(task, 'changes');
    },
    onError: (error, [companyId, taskId]) => handleError(error, companyId, taskId),
  });

  const clearErrors = useCallback(() => {
    setNoteError(null);
    setLastError(null);
    submitMutation.reset();
    approveMutation.reset();
    changesMutation.reset();
  }, [approveMutation, changesMutation, submitMutation]);

  /** `onBehalfOfUserId`: an admin handing in somebody else's part. `stepOrder`: the step it is on, for the message. */
  const submit = useCallback(
    (companyId: string, taskId: string, onBehalfOfUserId?: string, stepOrder?: number | null) => {
      setLastError(null);
      submittedStep.current = stepOrder ?? null;
      return submitMutation.mutate(companyId, taskId, onBehalfOfUserId);
    },
    [submitMutation],
  );

  const approve = useCallback(
    (companyId: string, taskId: string) => {
      setLastError(null);
      return approveMutation.mutate(companyId, taskId);
    },
    [approveMutation],
  );

  /** `userIds`: on a shared step, only these people go back; left out, everybody on it. */
  const requestChanges = useCallback(
    (companyId: string, taskId: string, note: string, userIds?: string[]) => {
      setNoteError(null);
      setLastError(null);
      // Mirror the API's rule before the round trip: whitespace is not a note.
      if (!note.trim()) {
        setNoteError('Say what needs changing: a note is required.');
        return Promise.resolve(null);
      }
      return changesMutation.mutate(companyId, taskId, note, userIds);
    },
    [changesMutation],
  );

  return {
    submit,
    approve,
    requestChanges,
    submitting: submitMutation.loading,
    approving: approveMutation.loading,
    requestingChanges: changesMutation.loading,
    busy: submitMutation.loading || approveMutation.loading || changesMutation.loading,
    /** Field-level: the note on request-changes. */
    noteError,
    /** Everything that is not a conflict or a note problem. */
    error: lastError,
    clearErrors,
  };
}
