import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useMutation } from '@/hooks/useAsync';
import { errorCode, errorMessage, isConflict } from '@/lib/http';
import { MY_WORK_KEY, queryKeys } from '@/lib/queryClient';
import { tasksService } from '@/services/tasks';
import { TaskReviewErrorCode, type Task } from '@/types/domain';
import { userLabel } from '@/utils/taskReview';

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
      if (isConflict(error) || code === TaskReviewErrorCode.INVALID_TRANSITION || code === TaskReviewErrorCode.REVIEW_ACTIONS_ONLY) {
        toast.error('Somebody already acted on this task. Refreshing…');
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
      toast.success(`Sent to ${userLabel(task.approver, 'the approver')} for review.`);
      options.onTask?.(task, 'submit');
    },
    onError: (error, [companyId, taskId]) => handleError(error, companyId, taskId),
  });

  const approveMutation = useMutation(tasksService.approve, {
    onSuccess: (task, [companyId]) => {
      invalidate(companyId);
      toast.success(`Approved "${task.title}".`);
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

  const submit = useCallback(
    (companyId: string, taskId: string) => {
      setLastError(null);
      return submitMutation.mutate(companyId, taskId);
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

  const requestChanges = useCallback(
    (companyId: string, taskId: string, note: string) => {
      setNoteError(null);
      setLastError(null);
      // Mirror the API's rule before the round trip: whitespace is not a note.
      if (!note.trim()) {
        setNoteError('Say what needs changing: a note is required.');
        return Promise.resolve(null);
      }
      return changesMutation.mutate(companyId, taskId, note);
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
