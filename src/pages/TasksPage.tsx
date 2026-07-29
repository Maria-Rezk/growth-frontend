import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { KanbanBoard } from '@/components/domain/KanbanBoard';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { tasksService } from '@/services/tasks';
import { companiesService } from '@/services/companies';
import { queryKeys } from '@/lib/queryClient';
import { fromInputDateTime, formatDateTime, humanize } from '@/utils/format';
import { TASK_BOARD, isOverdue } from '@/utils/workflow';
import { TaskPriority, TaskStatus, TaskType, type Task } from '@/types/domain';

type ViewMode = 'board' | 'table';
type Scope = 'all' | 'mine';
type AssigneeNameFn = (id?: string | null) => string;

const taskSchema = z.object({
  title: z.string().trim().min(3, 'Task title is required.'),
  description: z.string().optional(),
  type: z.nativeEnum(TaskType),
  priority: z.nativeEnum(TaskPriority),
  assignedToId: z.string().optional(),
  dueDate: z.string().optional(),
});

type TaskForm = z.infer<typeof taskSchema>;

export function TasksPage() {
  return <RequireCompany>{(companyId) => <TasksInner companyId={companyId} />}</RequireCompany>;
}

function TasksInner({ companyId }: { companyId: string }) {
  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [view, setView] = useState<ViewMode>('board');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = { status: status || undefined, priority: priority || undefined, type: type || undefined, search: debouncedSearch || undefined };
  const tasks = useAsync(
    () => (scope === 'mine' ? tasksService.listMine(companyId, filters) : tasksService.list(companyId, filters)),
    [companyId, scope, status, priority, type, debouncedSearch],
    { queryKey: [...queryKeys.tasks(companyId, filters), scope] },
  );
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });

  // Resolve assignedToId (a user id) to a display name using company members.
  const assigneeName = useMemo<AssigneeNameFn>(() => {
    const map = new Map<string, string>();
    (members.data ?? []).forEach((m) => map.set(m.userId, m.user?.fullName ?? m.user?.email ?? m.userId));
    return (id) => (id ? map.get(id) ?? 'Assigned' : 'Unassigned');
  }, [members.data]);

  const rows = tasks.data ?? [];
  const overdueCount = rows.filter((task) => isOverdue(task.dueDate) && task.status !== TaskStatus.DONE).length;

  const columns = useMemo<Column<Task>[]>(() => [
    { key: 'title', header: 'Task', sortValue: (task) => task.title, render: (task) => <div><Link className="table-link" to={`/tasks/${task.id}`}>{task.title}</Link><p className="muted">{humanize(task.type)}</p></div> },
    { key: 'status', header: 'Status', sortValue: (task) => task.status, render: (task) => <StatusBadge value={task.status} /> },
    { key: 'priority', header: 'Priority', sortValue: (task) => task.priority, render: (task) => <StatusBadge value={task.priority} /> },
    { key: 'assignee', header: 'Assigned', sortValue: (task) => assigneeName(task.assignedToId), render: (task) => assigneeName(task.assignedToId) },
    { key: 'due', header: 'Due', sortValue: (task) => task.dueDate ?? '', render: (task) => <span className={isOverdue(task.dueDate) && task.status !== TaskStatus.DONE ? 'danger-text' : undefined}>{formatDateTime(task.dueDate)}</span> },
    { key: 'actions', header: '', className: 'cell-right', render: (task) => <ButtonLink to={`/tasks/${task.id}`} variant="secondary" size="sm">Open</ButtonLink> },
  ], [assigneeName]);

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Internal work across copywriting, design, publishing, reporting and sales follow-up."
        action={
          <RoleGate permission="tasks:manage" fallback={<Button size="sm" disabled>New task</Button>}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>New task</Button>
          </RoleGate>
        }
      />

      <div className="task-alerts">
        <div className="task-alert card">
          <span>Overdue tasks</span>
          <strong>{overdueCount}</strong>
          <p>These require manager review before new work is accepted.</p>
        </div>
        <div className="task-alert card">
          <span>High priority</span>
          <strong>{rows.filter((task) => task.priority === TaskPriority.HIGH || task.priority === TaskPriority.URGENT).length}</strong>
          <p>Urgent and high-priority items across all statuses.</p>
        </div>
      </div>

      <div className="toolbar card">
        <div className="toolbar__filters toolbar__filters--wide">
          <Field label="Scope" htmlFor="task-scope">
            <SegmentedControl<Scope>
              label="Task scope"
              value={scope}
              onChange={setScope}
              options={[{ label: 'All tasks', value: 'all' }, { label: 'My tasks', value: 'mine' }]}
            />
          </Field>
          <Field label="Search" htmlFor="task-search"><Input id="task-search" placeholder="Search task title" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
          <Field label="Status" htmlFor="task-filter"><Select id="task-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.values(TaskStatus).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Priority" htmlFor="task-priority-filter"><Select id="task-priority-filter" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{Object.values(TaskPriority).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Type" htmlFor="task-type-filter"><Select id="task-type-filter" value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{Object.values(TaskType).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
        </div>
        <SegmentedControl<ViewMode>
          label="Task view"
          value={view}
          onChange={setView}
          options={[{ label: 'Board', value: 'board' }, { label: 'Table', value: 'table' }]}
        />
      </div>

      {view === 'board' ? (
        <section className="board-section" aria-label={scope === 'mine' ? 'My tasks board' : 'Internal execution board'}>
          <KanbanBoard columns={TASK_BOARD} items={rows} renderCard={(task) => <TaskBoardCard task={task} assigneeName={assigneeName(task.assignedToId)} />} emptyText={scope === 'mine' ? 'No tasks assigned to you here.' : 'No tasks here.'} />
          {tasks.loading ? <p className="muted">Loading tasks…</p> : null}
          {tasks.refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
          {tasks.error ? <p className="error-box" role="alert">{tasks.error}</p> : null}
        </section>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(task) => task.id} loading={tasks.loading} error={tasks.error} onRetry={tasks.refetch} emptyTitle={scope === 'mine' ? 'No tasks assigned to you' : 'No tasks found'} />
      )}
      <TaskModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} members={members.data ?? []} />
    </>
  );
}

function TaskBoardCard({ task, assigneeName }: { task: Task; assigneeName: string }) {
  return (
    <Link to={`/tasks/${task.id}`} className="kanban-card">
      <div className="kanban-card__head">
        <strong>{task.title}</strong>
        <StatusBadge value={task.priority} />
      </div>
      <p>{task.description || 'No description added yet.'}</p>
      <div className="kanban-card__meta">
        <span>{humanize(task.type)}</span>
        <span>{assigneeName}</span>
      </div>
      <div className="kanban-card__footer">
        <span className={isOverdue(task.dueDate) && task.status !== TaskStatus.DONE ? 'danger-text' : undefined}>{isOverdue(task.dueDate) && task.status !== TaskStatus.DONE ? 'Overdue' : 'Due'}</span>
        <strong>{formatDateTime(task.dueDate)}</strong>
      </div>
    </Link>
  );
}

function TaskModal({ open, companyId, onClose, members }: { open: boolean; companyId: string; onClose: () => void; members: Array<{ id: string; userId: string; role: string; user?: { fullName?: string; email?: string } }> }) {
  const create = useMutation(tasksService.create, { invalidateKeys: [['companies', companyId, 'tasks']] });
  const form = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: '', description: '', type: TaskType.GENERAL, priority: TaskPriority.MEDIUM, assignedToId: '', dueDate: '' },
    mode: 'onBlur',
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await create.mutate(companyId, {
      title: values.title.trim(),
      description: values.description,
      type: values.type,
      priority: values.priority,
      assignedToId: values.assignedToId || undefined,
      dueDate: fromInputDateTime(values.dueDate ?? ''),
    });
    if (result) {
      toast.success('Task created.');
      form.reset();
      onClose();
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Create task" footer={<><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" form="task-form" loading={form.formState.isSubmitting || create.loading}>Create task</Button></>}>
      <form id="task-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Title" htmlFor="task-title" error={form.formState.errors.title?.message}>
          <Input id="task-title" {...form.register('title')} />
        </Field>
        <Field label="Description" htmlFor="task-description" error={form.formState.errors.description?.message}>
          <Textarea id="task-description" rows={4} {...form.register('description')} />
        </Field>
        <div className="grid-2">
          <Field label="Type" htmlFor="task-type" error={form.formState.errors.type?.message}>
            <Select id="task-type" {...form.register('type')}>{Object.values(TaskType).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select>
          </Field>
          <Field label="Priority" htmlFor="task-priority" error={form.formState.errors.priority?.message}>
            <Select id="task-priority" {...form.register('priority')}>{Object.values(TaskPriority).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select>
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Assign to" htmlFor="task-assignee" hint="Optional. Leave unassigned if not decided.">
            <Select id="task-assignee" {...form.register('assignedToId')}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.userId}>
                  {member.user?.fullName ?? member.user?.email ?? member.userId} · {humanize(member.role)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="due" error={form.formState.errors.dueDate?.message}>
            <Input id="due" type="datetime-local" {...form.register('dueDate')} />
          </Field>
        </div>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}