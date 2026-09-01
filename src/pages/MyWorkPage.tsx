import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { ClientFilter, type ClientFilterValue } from '@/components/domain/ClientFilter';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useCompany } from '@/context/CompanyContext';
import { myWorkService, type MyWorkTask } from '@/services/myWork';
import { tasksService } from '@/services/tasks';
import { MY_WORK_KEY, queryKeys } from '@/lib/queryClient';
import { formatDate, humanize } from '@/utils/format';
import { needsTaskAction } from '@/utils/workflow';
import {
  byDueDateAscending,
  DUE_BUCKETS,
  DUE_BUCKET_HINTS,
  DUE_BUCKET_LABELS,
  groupByDueBucket,
  type DueBucket,
} from '@/utils/dueBuckets';
import { TaskStatus } from '@/types/domain';

/**
 * My work — every open task assigned to the signed-in user, across every
 * client they are a member of.
 *
 * This page deliberately does NOT go through <RequireCompany>. That guard is
 * the "pick a client first" gate, and the whole point here is that an employee
 * working for three clients should see one list of their day rather than three
 * lists they have to remember to visit. Security is unchanged: the clients
 * fanned out over are exactly the memberships the API already granted.
 *
 * Client-scoped pages (posts, leads, reports…) keep the gate — those screens
 * are about one client by definition.
 */
export function MyWorkPage() {
  const { companies, loading, error, refreshCompanies } = useCompany();

  if (loading) return <LoadingState label="Loading your clients…" />;
  if (error) return <ErrorState message={error} onRetry={refreshCompanies} />;
  if (companies.length === 0) {
    return (
      <EmptyState
        title="No client assigned yet"
        description="You are not assigned to any client yet — ask your manager."
      />
    );
  }

  return <MyWorkInner />;
}

function MyWorkInner() {
  const { companies, setActiveCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [client, setClient] = useState<ClientFilterValue>('all');

  const companyIds = useMemo(() => companies.map((company) => company.id), [companies]);

  const work = useAsync(
    () => myWorkService.listAcrossClients(companies),
    [companyIds.join('|')],
    { queryKey: queryKeys.myWork(companyIds) },
  );

  /*
    One instant for the whole render. Bucketing each row against its own
    `new Date()` would let a list straddle midnight and put two tasks with the
    same due date in different buckets.
  */
  const now = useMemo(() => new Date(), [work.data]);

  const setStatus = useMutation(tasksService.setStatus, {
    invalidateKeys: [MY_WORK_KEY],
    onSuccess: (_result, [companyId]) => {
      // My-work lives outside the ['companies', id, …] namespace, so the
      // per-client task lists need invalidating explicitly.
      void queryClient.invalidateQueries({ queryKey: ['companies', companyId, 'tasks'] });
    },
  });

  const openTasks = useMemo(
    () => (work.data?.tasks ?? []).filter(needsTaskAction),
    [work.data],
  );

  const countsByClient = useMemo(() => {
    const counts = new Map<string, number>();
    openTasks.forEach((task) => counts.set(task.clientId, (counts.get(task.clientId) ?? 0) + 1));
    return counts;
  }, [openTasks]);

  const clientOptions = useMemo(
    () => companies.map((company) => ({
      id: company.id,
      name: company.name,
      count: countsByClient.get(company.id) ?? 0,
    })),
    [companies, countsByClient],
  );

  const visible = useMemo(
    () => (client === 'all' ? openTasks : openTasks.filter((task) => task.clientId === client)),
    [client, openTasks],
  );

  const groups = useMemo(() => groupByDueBucket(visible, (task) => task.dueDate, now), [now, visible]);

  const openTask = (task: MyWorkTask) => {
    // Task detail is client-scoped. Point the app at the right client first,
    // or the page loads under whichever client happened to be active.
    setActiveCompanyId(task.clientId);
    navigate(`/tasks/${task.id}`);
  };

  const move = async (task: MyWorkTask, status: TaskStatus) => {
    const result = await setStatus.mutate(task.clientId, task.id, status);
    if (result) toast.success(`${task.title} → ${humanize(status)}`);
  };

  if (work.loading) return <LoadingState label="Loading your work…" />;
  if (work.error) return <ErrorState message={work.error} onRetry={work.refetch} />;

  const headline = summarise(groups);

  return (
    <>
      <PageHeader
        title="My work"
        subtitle="Every open task assigned to you, across every client you work on. The client is a label, not a gate."
      />

      {work.data?.unavailableClients.length ? (
        <p className="error-box" role="alert">
          Could not load work for: {work.data.unavailableClients.join(', ')}. Everything else is up to date.
        </p>
      ) : null}

      <div className="stat-grid stat-grid--3">
        <WorkTile label="Overdue" value={groups.overdue.length} tone="accent" helper="Late and still open." />
        <WorkTile label="Due today" value={groups.today.length} tone="warning" helper="Before the end of today." />
        <WorkTile label="This week" value={groups.week.length} tone="info" helper="Within the next seven days." />
      </div>

      {/* The client switcher on this screen filters; it does not lock the page
          to one client the way the topbar switcher does elsewhere. Nothing open
          means nothing to filter, so the row is dropped entirely rather than
          offering a wall of buttons that all lead to the same empty state. */}
      {openTasks.length > 0 && companies.length > 1 ? (
        <ClientFilter
          options={clientOptions}
          value={client}
          total={openTasks.length}
          onChange={setClient}
        />
      ) : null}

      {work.refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing open here"
            description={
              openTasks.length === 0
                ? 'No task is assigned to you right now across any client.'
                : 'No open task is assigned to you for this client.'
            }
            action={<ButtonLink to="/dashboard" variant="secondary" size="sm">Open client overview</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <p className="muted">{headline}</p>
          {DUE_BUCKETS.map((bucket) => (
            <DueGroup
              key={bucket}
              bucket={bucket}
              tasks={[...groups[bucket]].sort((a, b) => byDueDateAscending(a.dueDate, b.dueDate))}
              showClient={client === 'all'}
              busy={setStatus.loading}
              onOpen={openTask}
              onMove={move}
            />
          ))}
        </>
      )}

      {setStatus.error ? <p className="error-box" role="alert">{setStatus.error}</p> : null}
    </>
  );
}

/** "3 overdue · 4 due today · 2 this week" — the day in one line. */
function summarise(groups: Record<DueBucket, MyWorkTask[]>): string {
  const parts: string[] = [];
  if (groups.overdue.length) parts.push(`${groups.overdue.length} overdue`);
  if (groups.today.length) parts.push(`${groups.today.length} due today`);
  if (groups.week.length) parts.push(`${groups.week.length} this week`);
  if (!parts.length) return 'Nothing due in the next seven days.';
  return parts.join(' · ');
}

function WorkTile({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: 'accent' | 'warning' | 'info';
}) {
  return (
    <Card className={clsx('metric-card', `metric-card--${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </Card>
  );
}

function DueGroup({
  bucket,
  tasks,
  showClient,
  busy,
  onOpen,
  onMove,
}: {
  bucket: DueBucket;
  tasks: MyWorkTask[];
  showClient: boolean;
  busy: boolean;
  onOpen: (task: MyWorkTask) => void;
  onMove: (task: MyWorkTask, status: TaskStatus) => void;
}) {
  // An empty bucket is noise, not information — the tiles above already say
  // "zero overdue" for the one case where zero is worth stating.
  if (tasks.length === 0) return null;

  return (
    <Card className={clsx('due-group', bucket === 'overdue' && 'due-group--overdue')}>
      <CardHeader title={`${DUE_BUCKET_LABELS[bucket]} (${tasks.length})`} subtitle={DUE_BUCKET_HINTS[bucket]} />
      <div className="content-card__body">
        <ul className="work-list">
          {tasks.map((task) => (
            <li key={`${task.clientId}:${task.id}`} className="work-row">
              <div className="work-row__main">
                <button type="button" className="work-row__title" onClick={() => onOpen(task)}>
                  {task.title}
                </button>
                <p className="work-row__meta">
                  <span>{humanize(task.type)}</span>
                  <span aria-hidden="true">·</span>
                  <span className={bucket === 'overdue' ? 'danger-text' : undefined}>
                    {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                  </span>
                </p>
              </div>

              <div className="work-row__tags">
                {showClient ? <span className="client-tag">{task.clientName}</span> : null}
                <StatusBadge value={task.status} />
              </div>

              <div className="work-row__actions">
                {task.status === TaskStatus.TODO ? (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => onMove(task, TaskStatus.IN_PROGRESS)}>
                    Start
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onMove(task, TaskStatus.DONE)}>
                  Done
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
