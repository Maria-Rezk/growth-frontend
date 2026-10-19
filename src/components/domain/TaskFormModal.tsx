import { useCallback, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { ApproverPicker } from '@/components/domain/ApproverPicker';
import { AssigneeOptions, assigneeUserId, assigneeValueFor } from '@/components/domain/AssigneeOptions';
import { AttachmentsPanel } from '@/components/domain/AttachmentsPanel';
import { NO_PENDING_ATTACHMENTS, PendingAttachmentsField, pendingPayload, type PendingAttachments } from '@/components/domain/PendingAttachmentsField';
import { TaskTypePicker } from '@/components/domain/TaskTypes';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { applyServerFieldErrors } from '@/lib/forms';
import { errorCode, errorMessage } from '@/lib/http';
import { queryKeys } from '@/lib/queryClient';
import { responsibilitiesService } from '@/services/responsibilities';
import { tasksService } from '@/services/tasks';
import { TaskPriority, TaskReviewErrorCode, TaskType, type Membership, type Task } from '@/types/domain';
import { fromInputDateTime, humanize, toInputDateTime } from '@/utils/format';
import { memberLabel, routingForArea, type AreaRouting } from '@/utils/responsibilityRouting';

const taskSchema = z.object({
  title: z.string().trim().min(3, 'Task title is required.').max(180, 'Up to 180 characters.'),
  description: z.string().optional(),
  // Any number, none included: a draft may have no type yet.
  taskTypes: z.array(z.nativeEnum(TaskType)),
  customTaskType: z.string().optional(),
  priority: z.nativeEnum(TaskPriority),
  assignedToId: z.string().optional(),
  approverId: z.string().optional(),
  dueDate: z.string().optional(),
  // Stage order on a post. Blank means "not a stage".
  sequence: z
    .string()
    .optional()
    .refine((value) => !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 50), 'A whole number from 1 to 50.'),
}).superRefine((values, context) => {
  // Mirrors the API's 422 CUSTOM_TASK_TYPE_REQUIRED, so the field is flagged before a round trip.
  if (values.taskTypes.includes(TaskType.OTHER) && !values.customTaskType?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customTaskType'], message: 'Say what the other type of work is.' });
  }
});

type TaskForm = z.infer<typeof taskSchema>;

/** What a task is about, when it is created from a post, lead or campaign. */
export interface TaskLink {
  relatedEntityType: 'POST' | 'LEAD' | 'CAMPAIGN';
  relatedEntityId: string;
  /** Pre-fills the title, e.g. the post's name. */
  label?: string;
  /** Pre-selects the types, e.g. DESIGN for the design stage of a post. */
  taskTypes?: TaskType[];
  /** The text for `OTHER`, when pre-selected. */
  customTaskType?: string;
  /** Pre-fills the stage number. Posts only. */
  sequence?: number;
}

/** What the form holds for an existing task: every saved field, nothing defaulted over it. */
function formValuesFor(task: Task): TaskForm {
  return {
    title: task.title,
    description: task.description ?? '',
    taskTypes: task.taskTypes ?? [],
    customTaskType: task.customTaskType ?? '',
    priority: task.priority,
    assignedToId: task.assignedToId ?? '',
    approverId: task.approverId ?? '',
    dueDate: toInputDateTime(task.dueDate),
    sequence: task.sequence ? String(task.sequence) : '',
  };
}

/**
 * The one task form: creating a task or a draft, editing a draft, editing a
 * task. Passing `task` switches it to editing that task, with the same layout
 * and every saved value restored; a save PATCHes that task instead of
 * creating another. A draft additionally offers Publish, which saves the
 * edits and then issues it.
 *
 * Mount it per task (`key={task.id}`) so each open starts from that task's
 * saved values.
 */
export function TaskModal({
  open,
  companyId,
  onClose,
  members,
  link,
  task,
  onCreated,
  onSaved,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  members: Membership[];
  /** Attach the new task to a record — the post detail's "Add task". */
  link?: TaskLink;
  /** Edit this task (or draft) instead of creating one. */
  task?: Task;
  onCreated?: (task: Task) => void;
  /** After an edit is persisted (and, for Publish, issued). */
  onSaved?: (task: Task) => void;
}) {
  const editing = Boolean(task);
  const isDraft = Boolean(task?.isDraft);
  const form = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: task ? formValuesFor(task) : {
      title: link?.label ? `${link.label} — ` : '',
      description: '',
      taskTypes: link?.taskTypes ?? [],
      customTaskType: link?.customTaskType ?? '',
      priority: TaskPriority.MEDIUM,
      assignedToId: '',
      approverId: '',
      dueDate: '',
      sequence: link?.sequence ? String(link.sequence) : '',
    },
    mode: 'onBlur',
  });
  // A saved task carries its own parent; a new one takes it from the link.
  const onPost = (task?.relatedEntityType ?? link?.relatedEntityType)?.toUpperCase() === 'POST';
  const [pendingFiles, setPendingFiles] = useState<PendingAttachments>(NO_PENDING_ATTACHMENTS);
  const [uploading, setUploading] = useState(false);

  // Stable, so the picker's pre-fill effect does not re-run on every render.
  const setApprover = useCallback(
    (userId: string) => form.setValue('approverId', userId, { shouldDirty: true }),
    [form],
  );
  const watchedTypes = form.watch('taskTypes');
  const watchedCustomType = form.watch('customTaskType') ?? '';

  /*
    The responsibility matrix decides who this work belongs to.

    Until now the matrix was a page nobody opened: it recorded that Dina works
    on Instagram content and Amir approves it, but every task was still routed
    by whoever happened to be filling in this form. Picking an area here reads
    the matrix and fills in the assignee, and names who approves and who is
    told when it slips.

    It fills the field rather than locking it — the person creating the task
    can still override, which is what "expected" means as opposed to
    "permitted". Persisting the area on the task itself (so routing survives
    creation and can drive reassignment) needs a `responsibilityAreaId` field
    on the task API.
  */
  const [areaId, setAreaId] = useState('');
  const matrix = useAsync(
    () => responsibilitiesService.matrix(companyId),
    [companyId],
    { queryKey: queryKeys.responsibilityMatrix(companyId), enabled: open },
  );
  const routing = useMemo(() => routingForArea(matrix.data, areaId), [areaId, matrix.data]);

  const chooseArea = (nextAreaId: string) => {
    setAreaId(nextAreaId);
    const suggested = routingForArea(matrix.data, nextAreaId).executor;
    // Only prefill someone the Assign to list actually offers. Selecting a
    // value with no matching <option> silently falls back to the first one,
    // which would assign the task to the wrong person.
    const assignable = suggested && members.some((member) => member.userId === suggested.userId);
    form.setValue('assignedToId', assignable ? suggested.userId : '', { shouldDirty: true });
  };

  const onMutationError = (error: unknown) => {
      const code = errorCode(error);
      if (code === TaskReviewErrorCode.SEQUENCE_TAKEN || code === TaskReviewErrorCode.SEQUENCE_NEEDS_POST) {
        form.setError('sequence', { message: errorMessage(error) });
        return;
      }
      if (code === TaskReviewErrorCode.CUSTOM_TASK_TYPE_REQUIRED) {
        form.setError('customTaskType', { message: 'Say what the other type of work is.' });
        return;
      }
      applyServerFieldErrors(form, error);
  };
  const invalidateKeys = [['companies', companyId, 'tasks'], ['companies', companyId, 'posts']];
  const create = useMutation(tasksService.create, { invalidateKeys, onError: onMutationError });
  const update = useMutation(tasksService.update, { invalidateKeys, onError: onMutationError });
  const publish = useMutation(tasksService.publishDraft, { invalidateKeys });
  const busy = create.loading || update.loading || publish.loading;
  const mutationError = create.error ?? update.error ?? publish.error;

  // Reset the mutations too, or a previous error is still on screen next open.
  const close = () => {
    form.reset();
    create.reset();
    update.reset();
    publish.reset();
    setAreaId('');
    setPendingFiles(NO_PENDING_ATTACHMENTS);
    onClose();
  };
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  /*
    Editing: PATCH this task with what the form holds. A cleared assignee,
    approver, due date or stage goes as null, which is how the API clears
    them. Types are left out when none are ticked: an empty list is refused,
    and the API cannot clear them once set.
  */
  const saveExisting = async (existing: Task, values: TaskForm): Promise<Task | null> => {
    if (!values.taskTypes.length && (existing.taskTypes ?? []).length) {
      form.setError('taskTypes', { message: 'Keep at least one type.' });
      return null;
    }
    return update.mutate(companyId, existing.id, {
      title: values.title.trim(),
      description: values.description ?? '',
      taskTypes: values.taskTypes,
      customTaskType: values.customTaskType,
      priority: values.priority,
      assignedToId: values.assignedToId || null,
      approverId: values.approverId || null,
      dueDate: fromInputDateTime(values.dueDate ?? '') ?? null,
      ...(onPost ? { sequence: values.sequence ? Number(values.sequence) : null } : {}),
    });
  };

  const save = (asDraft: boolean) => form.handleSubmit(async (values) => {
    if (task) {
      const saved = await saveExisting(task, values);
      if (!saved) return;
      // Save draft keeps it a draft; the primary button on a draft publishes it.
      if (isDraft && !asDraft) {
        const published = await publish.mutate(companyId, task.id);
        if (!published) {
          // The edits are saved; only the publish failed. Keep the dialog open with the error.
          onSaved?.(saved);
          form.reset(formValuesFor(saved));
          return;
        }
        toast.success('Published. The assignee has been told.');
        onSaved?.(published);
      } else {
        toast.success(isDraft ? 'Draft saved.' : 'Task updated.');
        onSaved?.(saved);
      }
      close();
      return;
    }
    const result = await create.mutate(companyId, {
      title: values.title.trim(),
      description: values.description,
      taskTypes: values.taskTypes,
      customTaskType: values.customTaskType,
      isDraft: asDraft,
      priority: values.priority,
      assignedToId: values.assignedToId || undefined,
      // Empty means "let the matrix decide" — the backend resolves it again on create.
      approverId: values.approverId || undefined,
      dueDate: fromInputDateTime(values.dueDate ?? ''),
      relatedEntityType: link?.relatedEntityType,
      relatedEntityId: link?.relatedEntityId,
      sequence: onPost && values.sequence ? Number(values.sequence) : undefined,
      ...pendingPayload(pendingFiles),
    });
    if (result) {
      toast.success(asDraft ? 'Draft saved. Find it under My drafts.' : 'Task created.');
      onCreated?.(result);
      close();
    }
  });
  const submit = save(false);
  const saveDraft = save(true);

  const title = !editing ? 'Create task' : isDraft ? 'Edit draft' : 'Edit task';
  const primaryLabel = !editing ? 'Create task' : isDraft ? 'Publish task' : 'Save changes';
  // The draft button is for work not issued yet: a new task, or a draft.
  const offerDraft = !editing || isDraft;

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={title}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={cancel} disabled={busy}>Cancel</Button>
          {offerDraft ? <Button variant="secondary" type="button" onClick={saveDraft} disabled={uploading || busy}>Save draft</Button> : null}
          <Button type="submit" form="task-form" loading={form.formState.isSubmitting || busy} disabled={uploading}>{primaryLabel}</Button>
        </>
      )}
    >
      {isDraft ? <p className="muted task-form__note">A draft only you can see. Save it as often as you like; Publish issues it and tells the assignee.</p> : null}
      <form id="task-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Title" htmlFor="task-title" error={form.formState.errors.title?.message}>
          <Input id="task-title" maxLength={180} {...form.register('title')} />
        </Field>
        <Field label="Description" htmlFor="task-description" error={form.formState.errors.description?.message}>
          <Textarea id="task-description" rows={4} maxLength={3000} {...form.register('description')} />
        </Field>
        <TaskTypePicker
          value={watchedTypes}
          customValue={watchedCustomType}
          onChange={(next) => form.setValue('taskTypes', next, { shouldDirty: true })}
          onCustomChange={(next) => form.setValue('customTaskType', next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
          error={form.formState.errors.taskTypes?.message}
          customError={form.formState.errors.customTaskType?.message}
          disabled={busy}
        />
        <Field label="Priority" htmlFor="task-priority" error={form.formState.errors.priority?.message}>
          <Select id="task-priority" {...form.register('priority')}>{Object.values(TaskPriority).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select>
        </Field>
        <Field
          label="Responsibility area"
          htmlFor="task-area"
          hint="Optional. Picking an area routes the task using the responsibility matrix."
        >
          <Select id="task-area" value={areaId} onChange={(event) => chooseArea(event.target.value)} disabled={matrix.loading}>
            <option value="">{matrix.loading ? 'Loading areas…' : 'No area — assign manually'}</option>
            {(matrix.data?.areas ?? []).map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </Select>
        </Field>

        {areaId ? (
          <RoutingSummary
            routing={routing}
            executorIsMember={Boolean(routing.executor && members.some((member) => member.userId === routing.executor?.userId))}
          />
        ) : null}

        <div className="grid-2">
          <Field label="Assign to" htmlFor="task-assignee" hint="Optional. Leave unassigned if not decided.">
            {/*
              The field holds a plain user id; the option values carry a role
              too so one person can be listed under each of theirs. Assignment
              itself is per person — the role only helps find them.
            */}
            <Select
              id="task-assignee"
              value={assigneeValueFor(members, form.watch('assignedToId'))}
              onChange={(event) => form.setValue('assignedToId', assigneeUserId(event.target.value), { shouldDirty: true })}
            >
              <AssigneeOptions members={members} />
            </Select>
          </Field>
          <Field label="Due date" htmlFor="due" error={form.formState.errors.dueDate?.message}>
            <Input id="due" type="datetime-local" {...form.register('dueDate')} />
          </Field>
        </div>
        {/*
          Pre-filled from `resolve-approver` for the chosen type, and refilled
          when the type changes. Whoever is picked here is who the task waits
          on at "Submit for review"; the matrix is read once, at creation.
        */}
        {open ? (
          <ApproverPicker
            companyId={companyId}
            taskTypes={watchedTypes}
            members={members}
            value={form.watch('approverId') ?? ''}
            onChange={setApprover}
            error={form.formState.errors.approverId?.message}
            // Suggest an approver only for new work: editing must never replace the saved one on open.
            autoResolve={!editing}
          />
        ) : null}
        {onPost ? (
          <Field
            label="Stage on this post (optional)"
            htmlFor="task-sequence"
            hint="Stages run lowest number first; each waits for the ones before it. Leave blank if order doesn't matter."
            error={form.formState.errors.sequence?.message}
          >
            <Input id="task-sequence" type="number" inputMode="numeric" min={1} max={50} step={1} {...form.register('sequence')} />
          </Field>
        ) : null}
        {task ? (
          // A saved task's attachments are live records: list, add and remove them directly.
          <AttachmentsPanel companyId={companyId} parent={{ entityType: 'TASK', entityId: task.id }} title="Attachments" />
        ) : (
          <PendingAttachmentsField
            companyId={companyId}
            value={pendingFiles}
            onChange={setPendingFiles}
            onBusyChange={setUploading}
            disabled={busy}
          />
        )}
        {mutationError ? <p className="error-box" role="alert">{mutationError}</p> : null}
      </form>
    </Modal>
  );
}

/** What the matrix says about this area, in the words the matrix uses. */
function RoutingSummary({ routing, executorIsMember }: { routing: AreaRouting; executorIsMember: boolean }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Works on it', value: memberLabel(routing.executor) },
    { label: 'Approves', value: memberLabel(routing.approver) },
    { label: 'Supervises', value: memberLabel(routing.supervisor) },
  ];
  if (routing.informed.length) {
    rows.push({ label: 'Informed', value: routing.informed.map(memberLabel).join(', ') });
  }

  return (
    <div className="routing-summary">
      <p className="eyebrow">From the responsibility matrix</p>
      {rows.map((row) => (
        <div className="routing-summary__row" key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      {!routing.executor ? (
        <p className="muted">Nobody is set to work on this area yet — assign someone manually, or fill the matrix in.</p>
      ) : null}
      {routing.executor && !executorIsMember ? (
        <p className="muted">
          {memberLabel(routing.executor)} is named in the matrix but is not an active member of this client, so the
          assignee was left empty.
        </p>
      ) : null}
    </div>
  );
}