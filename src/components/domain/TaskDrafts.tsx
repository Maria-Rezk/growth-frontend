import { useState } from 'react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { TaskTypeChips } from '@/components/domain/TaskTypes';
import { RoleGate } from '@/components/domain/RoleGate';
import { TaskModal } from '@/components/domain/TaskFormModal';
import { useAssignableMembers } from '@/hooks/useAssignableMembers';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { errorCode } from '@/lib/http';
import { queryKeys } from '@/lib/queryClient';
import { tasksService } from '@/services/tasks';
import { TaskReviewErrorCode, type Task } from '@/types/domain';
import { formatDateTime } from '@/utils/format';

/**
 * The caller's own drafts. A draft is invisible to everyone else, notifies
 * nobody, and cannot change status until it is published; publishing is what
 * tells the assignee.
 *
 * A draft opens in the same form it was written in (TaskModal in edit mode),
 * with every saved value restored, not on the task detail page: unfinished
 * work is finished where it was started.
 */
export function TaskDrafts({ companyId, onCreate }: { companyId: string; onCreate: () => void }) {
  const drafts = useAsync(() => tasksService.listDrafts(companyId), [companyId], { queryKey: queryKeys.taskDrafts(companyId) });
  const invalidateKeys = [['companies', companyId, 'tasks']];
  // NOT_A_DRAFT is a 409: it was already published (or discarded) elsewhere. The list refreshes below; retrying would answer the same.
  const staleDraft = (error: unknown) => {
    if (errorCode(error) === TaskReviewErrorCode.NOT_A_DRAFT) void drafts.refetch();
  };
  const publish = useMutation(tasksService.publishDraft, { invalidateKeys, onError: staleDraft });
  const discard = useMutation(tasksService.discardDraft, { invalidateKeys, onError: staleDraft });
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const members = useAssignableMembers(companyId);
  const [editing, setEditing] = useState<Task | null>(null);

  const onPublish = async (task: Task) => {
    setBusyId(task.id);
    try {
      const result = await publish.mutate(companyId, task.id);
      if (result) toast.success(`“${task.title}” is now a task.`);
      await drafts.refetch();
    } finally {
      setBusyId(null);
    }
  };

  const onDiscard = async (task: Task) => {
    const ok = await confirm({
      title: 'Discard this draft?',
      message: <>“<strong>{task.title}</strong>” is deleted for good. A draft has not been sent to anyone.</>,
      confirmLabel: 'Discard draft',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(task.id);
    try {
      const done = await discard.mutate(companyId, task.id);
      if (done !== null) toast.success('Draft discarded.');
      await drafts.refetch();
    } finally {
      setBusyId(null);
    }
  };

  if (drafts.loading) return <Card><div className="content-card__body"><ListSkeleton rows={3} /></div></Card>;
  if (drafts.error) return <Card><ErrorState message={drafts.error} onRetry={drafts.refetch} /></Card>;

  const rows = drafts.data ?? [];
  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          title="No drafts"
          description="Save a half-written task as a draft. Only you can see it, and nobody is told until you publish it."
          action={<RoleGate permission="tasks:edit"><Button size="sm" onClick={onCreate}>Start a task</Button></RoleGate>}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="content-card__body">
        <p className="muted">Only you can see these. Publishing a draft adds it to the task list and tells the assignee.</p>
        {publish.error || discard.error ? <p className="error-box" role="alert">{publish.error ?? discard.error}</p> : null}
        <ul className="attachment-list">
          {rows.map((task) => (
            <li key={task.id} className="draft-row">
              <div className="draft-row__main">
                <button type="button" className="draft-row__title" onClick={() => setEditing(task)}>{task.title}</button>
                <p className="muted">
                  <Badge tone="neutral">Draft</Badge> <TaskTypeChips task={task} /> · saved {formatDateTime(task.updatedAt ?? task.createdAt)}
                </p>
              </div>
              <div className="draft-row__actions">
                <Button size="sm" variant="secondary" onClick={() => setEditing(task)} disabled={busyId !== null}>Edit</Button>
                <Button size="sm" onClick={() => void onPublish(task)} loading={busyId === task.id && publish.loading} disabled={busyId !== null}>Publish</Button>
                <Button size="sm" variant="ghost" onClick={() => void onDiscard(task)} loading={busyId === task.id && discard.loading} disabled={busyId !== null}>Discard</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {editing ? (
        <TaskModal
          key={editing.id}
          open
          companyId={companyId}
          members={members.data ?? []}
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void drafts.refetch()}
        />
      ) : null}
    </Card>
  );
}
