import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Fields';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { ApprovalQueue } from '@/components/domain/ApprovalQueue';
import { TaskDrafts } from '@/components/domain/TaskDrafts';
import { TaskModal } from '@/components/domain/TaskFormModal';
import { TaskTypeChips } from '@/components/domain/TaskTypes';
import { KanbanBoard } from '@/components/domain/KanbanBoard';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useUrlFilters } from '@/hooks/useDashboardFilters';
import { tasksService } from '@/services/tasks';
import { queryKeys } from '@/lib/queryClient';
import { useAssignableMembers } from '@/hooks/useAssignableMembers';
import { formatDateTime, humanize } from '@/utils/format';
import { TASK_TYPE_OPTIONS } from '@/utils/taskTypes';
import { TASK_BOARD, isOverdue } from '@/utils/workflow';
import { formatWaiting, isInReview, isWaitingLong, needsApprover, userLabel } from '@/utils/taskReview';
import { TaskPriority, TaskStatus, type Task } from '@/types/domain';
import { BoardSkeleton } from '@/components/ui/Skeleton';

type ViewMode = 'board' | 'table';
/** `approvals` is the review queue — what is waiting on *me* — and reads a different endpoint. */
type Scope = 'all' | 'mine' | 'approvals' | 'drafts';
type AssigneeNameFn = (id?: string | null) => string;

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
  const scope = (['all', 'mine', 'approvals', 'drafts'].includes(urlFilters.scope) ? urlFilters.scope : 'all') as Scope;
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
  // Approvals and drafts are their own lists; the filters and the board/table switch do not apply to them.
  const ownList = scope === 'approvals' || scope === 'drafts';
  const listScope = ownList ? 'all' : scope;
  const tasks = useAsync(
    () => (listScope === 'mine' ? tasksService.listMine(companyId, filters) : tasksService.list(companyId, filters)),
    [companyId, listScope, status, priority, type, debouncedSearch],
    { queryKey: [...queryKeys.tasks(companyId, filters), listScope], enabled: !ownList },
  );
  const members = useAssignableMembers(companyId);

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
    { queryKey: [...queryKeys.tasks(companyId, alertScope), 'alerts'], enabled: !ownList },
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
    { key: 'title', header: 'Task', sortValue: (task) => task.title, render: (task) => <div><Link className="table-link" to={`/tasks/${task.id}`}>{task.title}</Link><p><TaskTypeChips task={task} /></p></div> },
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
        subtitle="Internal work across plans, design, captions, reels, shoots, IT, operations and PR."
        action={
          <RoleGate permission="tasks:edit" fallback={<Button size="sm" disabled>New task</Button>}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>New task</Button>
          </RoleGate>
        }
      />

      <div className="task-alerts">
        <div className="task-alert card">
          <span>Overdue tasks</span>
          <strong>{alertTasks.loading || alertTasks.error ? '—' : overdueCount}</strong>
          <p>Past their due date and not done or canceled.</p>
        </div>
        <div className="task-alert card">
          <span>High priority</span>
          <strong>{alertTasks.loading || alertTasks.error ? '—' : highPriorityCount}</strong>
          <p>Urgent and high-priority items, ignoring the filters below.</p>
        </div>
        <div className={needsApproverCount > 0 ? 'task-alert task-alert--warning card' : 'task-alert card'}>
          <span>Needs an approver</span>
          <strong>{alertTasks.loading || alertTasks.error ? '—' : needsApproverCount}</strong>
          <p>In review with nobody named to approve. They wait until somebody is.</p>
        </div>
      </div>

      <div className="toolbar card">
        <div className={ownList ? 'toolbar__filters' : 'toolbar__filters toolbar__filters--wide'}>
          {/* A <label htmlFor> pointing at a role="group" that has no id is a
              dangling association. SegmentedControl already names itself with
              aria-label, so this just needs a visual heading. */}
          <div className="field toolbar__scope">
            <span className="field__label">Scope</span>
            <SegmentedControl<Scope>
              label="Task scope"
              value={scope}
              onChange={setScope}
              options={[
                { label: 'All tasks', value: 'all' },
                { label: 'My tasks', value: 'mine' },
                { label: 'Awaiting my approval', value: 'approvals' },
                { label: 'My drafts', value: 'drafts' },
              ]}
            />
          </div>
          {ownList ? null : (<>
          <Field label="Search" htmlFor="task-search"><Input id="task-search" placeholder="Search task title" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
          <Field label="Status" htmlFor="task-filter"><Select id="task-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.values(TaskStatus).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Priority" htmlFor="task-priority-filter"><Select id="task-priority-filter" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{Object.values(TaskPriority).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Type" htmlFor="task-type-filter"><Select id="task-type-filter" value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{TASK_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></Field>
          </>)}
        </div>
        {ownList ? null : (
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
      ) : scope === 'drafts' ? (
        <TaskDrafts companyId={companyId} onCreate={() => setCreateOpen(true)} />
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
            : <RoleGate permission="tasks:edit"><Button size="sm" onClick={() => setCreateOpen(true)}>Create the first task</Button></RoleGate>}
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
            : <RoleGate permission="tasks:edit"><Button size="sm" onClick={onCreate}>Create the first task</Button></RoleGate>}
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
        <TaskTypeChips task={task} />
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

