import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { TaskTypePicker } from '@/components/domain/TaskTypes';
import { useMutation } from '@/hooks/useAsync';
import { errorCode } from '@/lib/http';
import { tasksService } from '@/services/tasks';
import { TaskPriority, TaskReviewErrorCode, TaskType, type Task } from '@/types/domain';
import { fromInputDateTime, humanize, toInputDateTime } from '@/utils/format';

/**
 * Edit a task's own fields: title, description, types, priority, due date.
 * Assignee and approver have their own controls on the page.
 *
 * This is how a draft gets finished ("all other fields can be filled later")
 * and how types change after creation: the whole `taskTypes` list is sent and
 * replaces the old one.
 */
export function EditTaskModal({
  open,
  companyId,
  task,
  invalidateKeys,
  onClose,
  onSaved,
}: {
  open: boolean;
  companyId: string;
  task: Task;
  invalidateKeys: ReadonlyArray<readonly unknown[]>;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [taskTypes, setTaskTypes] = useState<TaskType[]>(task.taskTypes ?? []);
  const [custom, setCustom] = useState(task.customTaskType ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(toInputDateTime(task.dueDate));
  const [errors, setErrors] = useState<{ title?: string; custom?: string }>({});

  const save = useMutation(tasksService.update, {
    invalidateKeys,
    onError: (error) => {
      if (errorCode(error) === TaskReviewErrorCode.CUSTOM_TASK_TYPE_REQUIRED) {
        setErrors({ custom: 'Say what the other type of work is.' });
      }
    },
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (title.trim().length < 3) next.title = 'Task title is required.';
    if (taskTypes.includes(TaskType.OTHER) && !custom.trim()) next.custom = 'Say what the other type of work is.';
    setErrors(next);
    if (next.title || next.custom) return;

    const result = await save.mutate(companyId, task.id, {
      title: title.trim(),
      description,
      taskTypes,
      customTaskType: custom,
      priority,
      dueDate: fromInputDateTime(dueDate),
    });
    if (result) {
      toast.success('Task updated.');
      onSaved(result);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task.isDraft ? 'Edit draft' : 'Edit task'}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-task-form" loading={save.loading}>Save changes</Button>
        </>
      )}
    >
      <form id="edit-task-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Title" htmlFor="edit-task-title" error={errors.title}>
          <Input id="edit-task-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Description" htmlFor="edit-task-description">
          <Textarea id="edit-task-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <TaskTypePicker
          value={taskTypes}
          customValue={custom}
          onChange={setTaskTypes}
          onCustomChange={(next) => { setCustom(next); if (errors.custom) setErrors({}); }}
          customError={errors.custom}
          disabled={save.loading}
          hint="Saving replaces the types this task has now."
        />
        <div className="grid-2">
          <Field label="Priority" htmlFor="edit-task-priority">
            <Select id="edit-task-priority" value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])}>
              {Object.values(TaskPriority).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="edit-task-due">
            <Input id="edit-task-due" type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
        {save.error ? <p className="error-box" role="alert">{save.error}</p> : null}
      </form>
    </Modal>
  );
}
