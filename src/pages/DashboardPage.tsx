import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/State';
import { ActionCenter } from '@/components/domain/ActionCenter';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { reportsService } from '@/services/reports';
import { tasksService } from '@/services/tasks';
import { leadsService } from '@/services/leads';
import { contentService } from '@/services/content';
import { useCompany } from '@/context/CompanyContext';
import { useActiveRoles, useCan } from '@/hooks/usePermission';
import { humanizeRole } from '@/utils/roles';
import { groupByStatus, needsLeadAction, needsPostAction, needsTaskAction, TASK_BOARD } from '@/utils/workflow';
import { formatDate, formatPercent, humanize } from '@/utils/format';
import { LeadStatus, PostStatus, TaskStatus, type ContentPost, type Task } from '@/types/domain';
import { ReportDueNotice } from '@/components/domain/ReportDueNotice';
import { usePageTitle } from '@/hooks/usePageTitle';

/** Statuses that make a post "in the approval queue" — mirrors needsPostAction. */
const POST_ACTION_STATUSES = [PostStatus.READY_FOR_CLIENT, PostStatus.CHANGES_REQUESTED, PostStatus.APPROVED];
/** Mirrors needsLeadAction. */
const LEAD_ACTION_STATUSES = [LeadStatus.NEW, LeadStatus.INTERESTED, LeadStatus.WAITING_DECISION, LeadStatus.FOLLOW_UP_LATER];

function sumStatuses(counts: Record<string, number> | undefined, statuses: readonly string[]): number | undefined {
  if (!counts) return undefined;
  return statuses.reduce((total, status) => total + (counts[status] ?? 0), 0);
}

/** Exact per-status counts from a complete list, or `undefined` until the list has loaded. */
function countByStatus(items: ReadonlyArray<{ status: string }>, loaded: boolean): Record<string, number> | undefined {
  if (!loaded) return undefined;
  return items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }), {});
}

/** `—` while loading or unavailable, so an absent number never reads as zero. */
function display(value: number | string | undefined, loading: boolean): string {
  if (loading) return '—';
  if (value === undefined || value === null) return '—';
  return String(value);
}

export function DashboardPage() {
  return <RequireCompany>{(companyId) => <DashboardInner companyId={companyId} />}</RequireCompany>;
}

function DashboardInner({ companyId }: { companyId: string }) {
  const { activeCompany } = useCompany();
  const roles = useActiveRoles();
  /*
    The overview and the leads list are not open to every agency role (the
    overview is Account Manager and Client Owner; leads, Account Manager and
    Sales Agent). Asking anyway only earns a 403, which used to surface as an
    error card for a Designer opening their own overview. Skip what the role
    cannot read, and count from what it can.
  */
  const can = useCan();
  const canOverview = can('reports:view');
  const canLeads = can('leads:manage');
  const canReports = can('reports:list');

  /*
    Explicit query keys matter here. Without them useAsync falls back to a
    key derived from factory.toString(), so these queries lived outside the
    ['companies', id, 'leads' | 'posts' | 'tasks'] namespace: creating a lead
    invalidated nothing on this page and the dashboard stayed stale until a
    hard reload. These keys are prefix-matched by every existing mutation.
  */
  const overview = useAsync(
    () => reportsService.overview(companyId),
    [companyId],
    { queryKey: queryKeys.reportOverview(companyId), enabled: canOverview },
  );
  const tasks = useAsync(
    () => tasksService.list(companyId),
    [companyId],
    { queryKey: queryKeys.tasks(companyId, {}) },
  );
  const leads = useAsync(
    () => leadsService.list(companyId),
    [companyId],
    { queryKey: queryKeys.leads(companyId, { view: 'dashboard' }), enabled: canLeads },
  );
  const posts = useAsync(
    () => contentService.listPosts(companyId),
    [companyId],
    { queryKey: queryKeys.posts(companyId, {}) },
  );
  const reports = useAsync(() => reportsService.list(companyId), [companyId], { queryKey: queryKeys.reports(companyId), enabled: canReports });

  const allPosts = posts.data ?? [];
  const allTasks = tasks.data ?? [];
  const allLeads = leads.data ?? [];

  /*
    Counts come from the overview endpoint, which aggregates server-side.
    Deriving them from these lists was wrong: leadsService.list and
    listPosts unwrap `items` out of a paginated envelope, so past the
    backend's default page size the dashboard silently under-reported its
    headline numbers with nothing to indicate it.

    The lists are still used for the Action center and the recent rows —
    "show me a few things needing attention" is fine from a first page.
    Counting is not.
  */
  // Posts come back whole (a bare array), so a role without the overview still gets exact post counts.
  const postCounts = overview.data?.postsByStatus ?? countByStatus(allPosts, posts.data !== null);
  const approvalQueueCount = sumStatuses(postCounts, POST_ACTION_STATUSES);
  const activeLeadsCount = sumStatuses(overview.data?.leadsByStatus, LEAD_ACTION_STATUSES);

  // No server aggregate exists for tasks, so this one is still list-derived.
  const tasksByStatus = groupByStatus(allTasks);
  const openTasks = allTasks.filter(needsTaskAction);

  const approvalQueue = allPosts.filter(needsPostAction);
  const activeLeads = allLeads.filter(needsLeadAction);

  const postsByStatus = postCounts;
  const leadsByStatus = overview.data?.leadsByStatus;

  // A 403 means "not for your role", which the page already handles by hiding the part. Only real failures are errors.
  const failing = [overview, posts, leads, tasks].find((state) => state.error && state.errorStatus !== 403);
  const anyError = failing?.error ?? null;

  usePageTitle('Client overview');
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{activeCompany?.name ?? 'Overview'}</h1>
          <p className="page-header__subtitle">
            What needs action now across content approvals, lead follow-up and task execution.
          </p>
          {/* Who you are here is context, not an action: it sits with the title, not among the buttons. One badge per role. */}
          {roles.length ? (
            <p className="page-header__meta">
              <span className="muted">Your role</span>
              {roles.map((role) => <Badge key={role} tone="neutral">{humanizeRole(role)}</Badge>)}
            </p>
          ) : null}
        </div>
        <div className="page-header__action">
          <RoleGate permission="leads:manage">
            <ButtonLink to="/leads" variant="secondary" size="sm">Add lead</ButtonLink>
          </RoleGate>
          <RoleGate permission="posts:create">
            <ButtonLink to="/posts" size="sm">Create content</ButtonLink>
          </RoleGate>
        </div>
      </div>

      {/* A failed request used to leave every tile reading 0, which is
          indistinguishable from an empty workspace. */}
      {anyError ? (
        <Card>
          <ErrorState
            message={anyError}
            onRetry={() => {
              void overview.refetch();
              void posts.refetch();
              void leads.refetch();
              void tasks.refetch();
            }}
          />
        </Card>
      ) : null}

      {canReports ? <ReportDueNotice reports={reports.data} loading={reports.loading} /> : null}

      <div className="stat-grid">
        <MetricCard
          label="Client approvals"
          value={display(approvalQueueCount, overview.loading)}
          helper="Posts awaiting the client's decision or your next step"
          tone="accent"
        />
        {canOverview ? (
          <MetricCard
            label="Active leads"
            value={display(activeLeadsCount, overview.loading)}
            helper="New, interested, waiting decision or follow-up"
            tone="info"
          />
        ) : null}
        <MetricCard
          label="Open tasks"
          value={display(openTasks.length, tasks.loading)}
          helper="Execution work not completed yet"
          tone="warning"
        />
        {canOverview ? (
          <MetricCard
            label="Conversion rate"
            value={display(overview.data ? formatPercent(overview.data.conversionRate) : undefined, overview.loading)}
            helper="Won leads against total pipeline"
            tone="success"
          />
        ) : null}
      </div>

      <div className="dashboard-grid dashboard-grid--senior">
        <Card>
          <CardHeader title="Action center" subtitle="Sorted by operational urgency across posts, leads and tasks." />
          <ActionCenter posts={approvalQueue} leads={activeLeads} tasks={openTasks} />
        </Card>

        <Card>
          <CardHeader title="Delivery health" subtitle="Signals account managers should watch." />
          <div className="insight-list">
            <Insight label="Ready for client" value={postsByStatus?.[PostStatus.READY_FOR_CLIENT]} loading={overview.loading || posts.loading} to="/posts" />
            <Insight label="Changes requested" value={postsByStatus?.[PostStatus.CHANGES_REQUESTED]} loading={overview.loading || posts.loading} to="/posts" />
            {canOverview ? <Insight label="Leads waiting decision" value={leadsByStatus?.[LeadStatus.WAITING_DECISION]} loading={overview.loading} to="/leads" /> : null}
            <Insight label="Blocked tasks" value={tasksByStatus[TaskStatus.BLOCKED]?.length ?? 0} loading={tasks.loading} to="/tasks" />
          </div>
          {overview.data?.recommendations?.length ? (
            <div className="recommendation-stack">
              <p className="eyebrow">Recommended next moves</p>
              {overview.data.recommendations.slice(0, 3).map((item) => (
                <p key={item} className="recommendation">{item}</p>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="dashboard-grid">
        <Card>
          <CardHeader
            title="Content workflow"
            subtitle="Where every post currently sits."
            action={<ButtonLink to="/posts" variant="ghost" size="sm">Open board</ButtonLink>}
          />
          {/* Every status, not a hand-picked six. The old list omitted
              Changes requested — the status the card below calls out as the
              one to watch — and Canceled. */}
          <div className="mini-pipeline">
            {Object.values(PostStatus).map((status) => (
              <MiniStage
                key={status}
                label={humanize(status)}
                value={postsByStatus?.[status]}
                loading={overview.loading || posts.loading}
              />
            ))}
          </div>
          <div className="stack-list compact-list">
            {posts.loading ? <p className="muted">Loading recent content…</p> : null}
            {!posts.loading && !posts.error && allPosts.length === 0 ? <p className="muted">No content posts yet.</p> : null}
            {allPosts.slice(0, 5).map((post) => <PostRow key={post.id} post={post} />)}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Task execution"
            subtitle="Current execution workload by stage."
            action={<ButtonLink to="/tasks" variant="ghost" size="sm">Open board</ButtonLink>}
          />
          <div className="mini-pipeline">
            {TASK_BOARD.map((status) => (
              <MiniStage
                key={status}
                label={humanize(status)}
                value={tasksByStatus[status]?.length ?? 0}
                loading={tasks.loading}
              />
            ))}
          </div>
          <div className="stack-list compact-list">
            {tasks.loading ? <p className="muted">Loading task board…</p> : null}
            {!tasks.loading && !tasks.error && openTasks.length === 0 ? <p className="muted">No open tasks.</p> : null}
            {openTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)}
          </div>
        </Card>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: 'accent' | 'info' | 'warning' | 'success';
}) {
  return (
    <Card className={`metric-card metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </Card>
  );
}

function Insight({ label, value, loading, to }: { label: string; value?: number; loading: boolean; to: string }) {
  return (
    <Link to={to} className="insight-row">
      <span>{label}</span>
      <strong>{display(value, loading)}</strong>
    </Link>
  );
}

function MiniStage({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="mini-stage">
      <strong>{display(value, loading)}</strong>
      <span>{label}</span>
    </div>
  );
}

function PostRow({ post }: { post: ContentPost }) {
  return (
    <Link to={`/posts/${post.id}`} className="list-row list-row--dense">
      <div>
        <strong>{post.title}</strong>
        <p className="muted">{post.platform ?? 'No platform'} · {formatDate(post.scheduledAt)}</p>
      </div>
      <StatusBadge value={post.status} />
    </Link>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <Link to={`/tasks/${task.id}`} className="list-row list-row--dense">
      <div>
        <strong>{task.title}</strong>
        <p className="muted">{task.assignedTo?.fullName ?? 'Unassigned'} · {formatDate(task.dueDate)}</p>
      </div>
      <StatusBadge value={task.priority} />
    </Link>
  );
}
