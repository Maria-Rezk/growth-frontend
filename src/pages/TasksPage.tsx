import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';
import { KanbanBoard } from '@/components/domain/KanbanBoard';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { applyServerFieldErrors } from '@/lib/forms';
import { tasksService } from '@/services/tasks';
import { companiesService } from '@/services/companies';
import { responsibilitiesService } from '@/services/responsibilities';
import { queryKeys } from '@/lib/queryClient';
import { fromInputDateTime, formatDateTime, humanize } from '@/utils/format';
import { memberLabel, routingForArea, type AreaRouting } from '@/utils/responsibilityRouting';
import { TASK_BOARD, isOverdue } from '@/utils/workflow';
import { TaskPriority, TaskStatus, TaskType, type Membership, type Task } from '@/types/domain';
import { AssigneeOptions, assigneeUserId, assigneeValueFor } from '@/components/domain/AssigneeOptions';

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

/** Overdue only applies to work someone is still expected to complete. */
function isTaskOverdue(task: Task): boolean {
  return isOverdue(task.dueDate) && task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELED;
}

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

  /*
    The alert tiles are workspace-level KPIs, so they must not be computed
    from `tasks.data` — that is the *filtered* result. Filtering to Done made
    "Overdue" read 0; filtering to Low priority made "High priority" read 0,
    while the tile copy claimed "across all statuses".

    Scope still applies (All vs My tasks) because that is the frame the user
    has chosen, but the field filters do not. One extra unfiltered request,
    cached separately.
  */
  const alertScope = { scope };
  const alertTasks = useAsync(
    () => (scope === 'mine' ? tasksService.listMine(companyId) : tasksService.list(companyId)),
    [companyId, scope],
    { queryKey: [...queryKeys.tasks(companyId, alertScope), 'alerts'] },
  );

  // Resolve assignedToId (a user id) to a display name using company members.
  const assigneeName = useMemo<AssigneeNameFn>(() => {
    const map = new Map<string, string>();
    (members.data ?? []).forEach((m) => map.set(m.userId, m.user?.fullName ?? m.user?.email ?? m.userId));
    // Don't claim "Assigned" for a name that simply hasn't loaded yet.
    return (id) => {
      if (!id) return 'Unassigned';
      return map.get(id) ?? (members.loading ? '…' : 'Unknown member');
    };
  }, [members.data, members.loading]);

  const rows = tasks.data ?? [];
  const alertRows = alertTasks.data ?? [];
  const overdueCount = alertRows.filter(isTaskOverdue).length;
  const highPriorityCount = alertRows.filter((task) => task.priority === TaskPriority.HIGH || task.priority === TaskPriority.URGENT).length;

  const columns = useMemo<Column<Task>[]>(() => [
    { key: 'title', header: 'Task', sortValue: (task) => task.title, render: (task) => <div><Link className="table-link" to={`/tasks/${task.id}`}>{task.title}</Link><p className="muted">{humanize(task.type)}</p></div> },
    { key: 'status', header: 'Status', sortValue: (task) => task.status, render: (task) => <StatusBadge value={task.status} /> },
    { key: 'priority', header: 'Priority', sortValue: (task) => task.priority, render: (task) => <StatusBadge value={task.priority} /> },
    { key: 'assignee', header: 'Assigned', sortValue: (task) => assigneeName(task.assignedToId), render: (task) => assigneeName(task.assignedToId) },
    { key: 'due', header: 'Due', sortValue: (task) => task.dueDate ?? '', render: (task) => <span className={isTaskOverdue(task) ? 'danger-text' : undefined}>{formatDateTime(task.dueDate)}</span> },
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
          <strong>{alertTasks.loading ? '—' : overdueCount}</strong>
          <p>Past their due date and not done or canceled.</p>
        </div>
        <div className="task-alert card">
          <span>High priority</span>
          <strong>{alertTasks.loading ? '—' : highPriorityCount}</strong>
          <p>Urgent and high-priority items, ignoring the filters below.</p>
        </div>
      </div>

      <div className="toolbar card">
        <div className="toolbar__filters toolbar__filters--wide">
          {/* A <label htmlFor> pointing at a role="group" that has no id is a
              dangling association. SegmentedControl already names itself with
              aria-label, so this just needs a visual heading. */}
          <div className="field">
            <span className="field__label">Scope</span>
            <SegmentedControl<Scope>
              label="Task scope"
              value={scope}
              onChange={setScope}
              options={[{ label: 'All tasks', value: 'all' }, { label: 'My tasks', value: 'mine' }]}
            />
          </div>
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
        <TaskBoardView
          loading={tasks.loading}
          refreshing={tasks.refreshing}
          error={tasks.error}
          rows={rows}
          onRetry={tasks.refetch}
          assigneeName={assigneeName}
          scope={scope}
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(task) => task.id} loading={tasks.loading} error={tasks.error} onRetry={tasks.refetch} emptyTitle={scope === 'mine' ? 'No tasks assigned to you' : 'No tasks found'} defaultSortKey="title" />
      )}
      <TaskModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} members={members.data ?? []} />
    </>
  );
}

/**
 * The board used to render with `items={[]}` while loading, so every column
 * read "No tasks here" before popping to real data, and an error appeared
 * below a board that was still showing stale empty columns.
 */
function TaskBoardView({
  loading,
  refreshing,
  error,
  rows,
  onRetry,
  assigneeName,
  scope,
}: {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  rows: Task[];
  onRetry: () => void;
  assigneeName: AssigneeNameFn;
  scope: Scope;
}) {
  if (loading) return <Card><LoadingState label="Loading tasks…" /></Card>;
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>;

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title={scope === 'mine' ? 'No tasks assigned to you' : 'No tasks match these filters'}
          description="Clear the search or choose different filters."
        />
      </Card>
    );
  }

  return (
    <section className="board-section" aria-label={scope === 'mine' ? 'My tasks board' : 'Internal execution board'}>
      {refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
      <KanbanBoard
        columns={TASK_BOARD}
        items={rows}
        renderCard={(task) => <TaskBoardCard task={task} assigneeName={assigneeName(task.assignedToId)} />}
        emptyText={scope === 'mine' ? 'No tasks assigned to you here.' : 'No tasks here.'}
      />
    </section>
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
        {/* A canceled task can't be overdue — nobody is expected to finish it. */}
        <span className={isTaskOverdue(task) ? 'danger-text' : undefined}>{isTaskOverdue(task) ? 'Overdue' : 'Due'}</span>
        <strong>{formatDateTime(task.dueDate)}</strong>
      </div>
    </Link>
  );
}

function TaskModal({ open, companyId, onClose, members }: { open: boolean; companyId: string; onClose: () => void; members: Membership[] }) {
  const form = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: '', description: '', type: TaskType.GENERAL, priority: TaskPriority.MEDIUM, assignedToId: '', dueDate: '' },
    mode: 'onBlur',
  });

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

  const create = useMutation(tasksService.create, {
    invalidateKeys: [['companies', companyId, 'tasks']],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  // Reset the mutation too, or a previous error is still on screen next open.
  const close = () => {
    form.reset();
    create.reset();
    setAreaId('');
    onClose();
  };

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
      close();
    }
  });

  return (
    <Modal open={open} onClose={close} title="Create task" footer={<><Button variant="secondary" type="button" onClick={close}>Cancel</Button><Button type="submit" form="task-form" loading={form.formState.isSubmitting || create.loading}>Create task</Button></>}>
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
              onChange={(event) => form.setValue('assignedToId', assigneeUserId(event.target.value))}
            >
              <AssigneeOptions members={members} />
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