import { useCallback, useMemo, useState } from 'react';
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
import { EmptyState, ErrorState } from '@/components/ui/State';
import { ApprovalQueue } from '@/components/domain/ApprovalQueue';
import { ApproverPicker } from '@/components/domain/ApproverPicker';
import { KanbanBoard } from '@/components/domain/KanbanBoard';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useUrlFilters } from '@/hooks/useDashboardFilters';
import { applyServerFieldErrors } from '@/lib/forms';
import { tasksService } from '@/services/tasks';
import { companiesService } from '@/services/companies';
import { responsibilitiesService } from '@/services/responsibilities';
import { queryKeys } from '@/lib/queryClient';
import { fromInputDateTime, formatDateTime, humanize } from '@/utils/format';
import { memberLabel, routingForArea, type AreaRouting } from '@/utils/responsibilityRouting';
import { TASK_BOARD, isOverdue } from '@/utils/workflow';
import { formatWaiting, isInReview, isWaitingLong, needsApprover, userLabel } from '@/utils/taskReview';
import { TaskPriority, TaskStatus, TaskType, type Membership, type Task } from '@/types/domain';
import { AssigneeOptions, assigneeUserId, assigneeValueFor } from '@/components/domain/AssigneeOptions';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { BoardSkeleton } from '@/components/ui/Skeleton';

type ViewMode = 'board' | 'table';
/** `approvals` is the review queue — what is waiting on *me* — and reads a different endpoint. */
type Scope = 'all' | 'mine' | 'approvals';
type AssigneeNameFn = (id?: string | null) => string;

const taskSchema = z.object({
  title: z.string().trim().min(3, 'Task title is required.'),
  description: z.string().optional(),
  type: z.nativeEnum(TaskType),
  priority: z.nativeEnum(TaskPriority),
  assignedToId: z.string().optional(),
  approverId: z.string().optional(),
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

const TASK_FILTER_DEFAULTS = { scope: 'all', status: '', priority: '', type: '', search: '', view: 'board' } as const;

function TasksInner({ companyId }: { companyId: string }) {
  // Filters live in the URL: a filtered list is a shareable link, and a
  // reload or Back does not snap the page back to "all".
  const [urlFilters, setUrlFilters] = useUrlFilters<Record<keyof typeof TASK_FILTER_DEFAULTS, string>>(TASK_FILTER_DEFAULTS);
  const scope = (['all', 'mine', 'approvals'].includes(urlFilters.scope) ? urlFilters.scope : 'all') as Scope;
  const view = (urlFilters.view === 'table' ? 'table' : 'board') as ViewMode;
  const { status, priority, type, search } = urlFilters;
  const setScope = (value: Scope) => setUrlFilters({ scope: value });
  const setView = (value: ViewMode) => setUrlFilters({ view: value });
  const setStatus = (value: string) => setUrlFilters({ status: value });
  const setPriority = (value: string) => setUrlFilters({ priority: value });
  const setType = (value: string) => setUrlFilters({ type: value });
  const setSearch = (value: string) => setUrlFilters({ search: value });
  const filtersActive = Boolean(status || priority || type || search);
  const clearFilters = () => setUrlFilters({ status: '', priority: '', type: '', search: '' });
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);

  const filters = { status: status || undefined, priority: priority || undefined, type: type || undefined, search: debouncedSearch || undefined };
  const listScope = scope === 'approvals' ? 'all' : scope;
  const tasks = useAsync(
    () => (listScope === 'mine' ? tasksService.listMine(companyId, filters) : tasksService.list(companyId, filters)),
    [companyId, listScope, status, priority, type, debouncedSearch],
    { queryKey: [...queryKeys.tasks(companyId, filters), listScope], enabled: scope !== 'approvals' },
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
  const alertScope = { scope: listScope };
  const alertTasks = useAsync(
    () => (listScope === 'mine' ? tasksService.listMine(companyId) : tasksService.list(companyId)),
    [companyId, listScope],
    { queryKey: [...queryKeys.tasks(companyId, alertScope), 'alerts'], enabled: scope !== 'approvals' },
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
  // In review with nobody named — nothing will happen to these until somebody is.
  const needsApproverCount = alertRows.filter(needsApprover).length;

  const columns = useMemo<Column<Task>[]>(() => [
    { key: 'title', header: 'Task', sortValue: (task) => task.title, render: (task) => <div><Link className="table-link" to={`/tasks/${task.id}`}>{task.title}</Link><p className="muted">{humanize(task.type)}</p></div> },
    { key: 'status', header: 'Status', sortValue: (task) => task.status, render: (task) => <ReviewStatusCell task={task} /> },
    { key: 'priority', header: 'Priority', sortValue: (task) => task.priority, render: (task) => <StatusBadge value={task.priority} /> },
    { key: 'assignee', header: 'Assigned', sortValue: (task) => assigneeName(task.assignedToId), render: (task) => assigneeName(task.assignedToId) },
    { key: 'approver', header: 'Approver', sortValue: (task) => (task.approverId ? userLabel(task.approver, assigneeName(task.approverId)) : ''), render: (task) => <ApproverCell task={task} resolveName={assigneeName} /> },
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
        <div className={needsApproverCount > 0 ? 'task-alert task-alert--warning card' : 'task-alert card'}>
          <span>Needs an approver</span>
          <strong>{alertTasks.loading ? '—' : needsApproverCount}</strong>
          <p>In review with nobody named to approve. They wait until somebody is.</p>
        </div>
      </div>

      <div className="toolbar card">
        <div className={scope === 'approvals' ? 'toolbar__filters' : 'toolbar__filters toolbar__filters--wide'}>
          {/* A <label htmlFor> pointing at a role="group" that has no id is a
              dangling association. SegmentedControl already names itself with
              aria-label, so this just needs a visual heading. */}
          <div className="field">
            <span className="field__label">Scope</span>
            <SegmentedControl<Scope>
              label="Task scope"
              value={scope}
              onChange={setScope}
              options={[
                { label: 'All tasks', value: 'all' },
                { label: 'My tasks', value: 'mine' },
                { label: 'Awaiting my approval', value: 'approvals' },
              ]}
            />
          </div>
          {scope === 'approvals' ? null : (<>
          <Field label="Search" htmlFor="task-search"><Input id="task-search" placeholder="Search task title" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
          <Field label="Status" htmlFor="task-filter"><Select id="task-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.values(TaskStatus).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Priority" htmlFor="task-priority-filter"><Select id="task-priority-filter" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{Object.values(TaskPriority).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Type" htmlFor="task-type-filter"><Select id="task-type-filter" value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{Object.values(TaskType).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          </>)}
        </div>
        {scope === 'approvals' ? null : (
          <SegmentedControl<ViewMode>
            label="Task view"
            value={view}
            onChange={setView}
            options={[{ label: 'Board', value: 'board' }, { label: 'Table', value: 'table' }]}
          />
        )}
      </div>

      {scope === 'approvals' ? (
        <ApprovalQueue companyId={companyId} compact />
      ) : view === 'board' ? (
        <TaskBoardView
          loading={tasks.loading}
          refreshing={tasks.refreshing}
          error={tasks.error}
          rows={rows}
          onRetry={tasks.refetch}
          assigneeName={assigneeName}
          scope={scope}
          filtersActive={filtersActive}
          onClearFilters={clearFilters}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(task) => task.id}
          loading={tasks.loading}
          error={tasks.error}
          onRetry={tasks.refetch}
          emptyTitle={filtersActive ? 'No tasks match these filters' : scope === 'mine' ? 'No tasks assigned to you' : 'No tasks yet'}
          emptyDescription={filtersActive ? undefined : scope === 'mine' ? 'Work assigned to you on this client shows up here.' : 'Tasks are the internal work behind every post, lead and report.'}
          emptyAction={filtersActive
            ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>
            : <RoleGate permission="tasks:manage"><Button size="sm" onClick={() => setCreateOpen(true)}>Create the first task</Button></RoleGate>}
          defaultSortKey="title"
        />
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
  filtersActive,
  onClearFilters,
  onCreate,
}: {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  rows: Task[];
  onRetry: () => void;
  assigneeName: AssigneeNameFn;
  scope: Scope;
  filtersActive: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  if (loading) return <BoardSkeleton columns={TASK_BOARD} />;
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>;

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title={filtersActive ? 'No tasks match these filters' : scope === 'mine' ? 'No tasks assigned to you' : 'No tasks yet'}
          description={filtersActive ? 'Clear the search or choose different filters.' : scope === 'mine' ? 'Work assigned to you on this client shows up here.' : 'Tasks are the internal work behind every post, lead and report. Create one, or pick a responsibility area and let the matrix route it.'}
          action={filtersActive
            ? <Button variant="secondary" size="sm" onClick={onClearFilters}>Clear filters</Button>
            : <RoleGate permission="tasks:manage"><Button size="sm" onClick={onCreate}>Create the first task</Button></RoleGate>}
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
      {isInReview(task) ? (
        <div className="kanban-card__review">
          {needsApprover(task) ? (
            <Badge tone="warning">Needs an approver</Badge>
          ) : (
            <>
              <span className="muted">Waiting on {userLabel(task.approver)}</span>
              <Badge tone={isWaitingLong(task.submittedForReviewAt) ? 'warning' : 'info'}>{formatWaiting(task.submittedForReviewAt)}</Badge>
            </>
          )}
        </div>
      ) : task.reviewNote && task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELED ? (
        <div className="kanban-card__review">
          <Badge tone="warning">Changes requested</Badge>
        </div>
      ) : null}
      <div className="kanban-card__footer">
        {/* A canceled task can't be overdue — nobody is expected to finish it. */}
        <span className={isTaskOverdue(task) ? 'danger-text' : undefined}>{isTaskOverdue(task) ? 'Overdue' : 'Due'}</span>
        <strong>{formatDateTime(task.dueDate)}</strong>
      </div>
    </Link>
  );
}

/** Status, plus how long a review has been waiting — the number that decides who gets chased. */
function ReviewStatusCell({ task }: { task: Task }) {
  if (!isInReview(task)) {
    return (
      <span className="cell-stack">
        <StatusBadge value={task.status} />
        {task.reviewNote && task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELED ? <span className="muted">Changes requested</span> : null}
      </span>
    );
  }
  return (
    <span className="cell-stack">
      <StatusBadge value={task.status} />
      <span className={isWaitingLong(task.submittedForReviewAt) ? 'danger-text' : 'muted'}>waiting {formatWaiting(task.submittedForReviewAt)}</span>
    </span>
  );
}

function ApproverCell({ task, resolveName }: { task: Task; resolveName: AssigneeNameFn }) {
  if (!task.approverId) {
    return isInReview(task) ? <Badge tone="warning">Needs an approver</Badge> : <span className="muted">—</span>;
  }
  const inactive = task.approver?.status && task.approver.status !== 'ACTIVE';
  return (
    <span className="cell-stack">
      <span>{userLabel(task.approver, resolveName(task.approverId))}</span>
      {inactive ? <Badge tone="danger">Deactivated</Badge> : null}
    </span>
  );
}

/** What a task is about, when it is created from a post, lead or campaign. */
export interface TaskLink {
  relatedEntityType: 'POST' | 'LEAD' | 'CAMPAIGN';
  relatedEntityId: string;
  /** Pre-fills the title, e.g. the post's name. */
  label?: string;
  /** Pre-selects the type, e.g. DESIGN for the design stage of a post. */
  type?: TaskType;
}

export function TaskModal({
  open,
  companyId,
  onClose,
  members,
  link,
  onCreated,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  members: Membership[];
  /** Attach the new task to a record — the post detail's "Add task". */
  link?: TaskLink;
  onCreated?: (task: Task) => void;
}) {
  const form = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: link?.label ? `${link.label} — ` : '', description: '', type: link?.type ?? TaskType.GENERAL, priority: TaskPriority.MEDIUM, assignedToId: '', approverId: '', dueDate: '' },
    mode: 'onBlur',
  });

  // Stable, so the picker's pre-fill effect does not re-run on every render.
  const setApprover = useCallback(
    (userId: string) => form.setValue('approverId', userId, { shouldDirty: true }),
    [form],
  );
  const watchedType = form.watch('type');

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
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  const submit = form.handleSubmit(async (values) => {
    const result = await create.mutate(companyId, {
      title: values.title.trim(),
      description: values.description,
      type: values.type,
      priority: values.priority,
      assignedToId: values.assignedToId || undefined,
      // Empty means "let the matrix decide" — the backend resolves it again on create.
      approverId: values.approverId || undefined,
      dueDate: fromInputDateTime(values.dueDate ?? ''),
      relatedEntityType: link?.relatedEntityType,
      relatedEntityId: link?.relatedEntityId,
    });
    if (result) {
      toast.success('Task created.');
      onCreated?.(result);
      close();
    }
  });

  return (
    <Modal open={open} onClose={cancel} title="Create task" footer={<><Button variant="secondary" type="button" onClick={cancel}>Cancel</Button><Button type="submit" form="task-form" loading={form.formState.isSubmitting || create.loading}>Create task</Button></>}>
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
        {/*
          Pre-filled from `resolve-approver` for the chosen type, and refilled
          when the type changes. Whoever is picked here is who the task waits
          on at "Submit for review"; the matrix is read once, at creation.
        */}
        {open ? (
          <ApproverPicker
            companyId={companyId}
            taskType={watchedType}
            members={members}
            value={form.watch('approverId') ?? ''}
            onChange={setApprover}
            error={form.formState.errors.approverId?.message}
          />
        ) : null}
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