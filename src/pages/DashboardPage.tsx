import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ActionCenter } from '@/components/domain/ActionCenter';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync } from '@/hooks/useAsync';
import { reportsService } from '@/services/reports';
import { tasksService } from '@/services/tasks';
import { leadsService } from '@/services/leads';
import { contentService } from '@/services/content';
import { useCompany } from '@/context/CompanyContext';
import { getActiveRole, roleLabel } from '@/utils/permissions';
import { groupByStatus, needsLeadAction, needsPostAction, needsTaskAction, TASK_BOARD } from '@/utils/workflow';
import { formatDate, formatPercent, humanize } from '@/utils/format';
import { LeadStatus, PostStatus, TaskStatus, type ContentPost, type Lead, type Task } from '@/types/domain';

export function DashboardPage() {
  return <RequireCompany>{(companyId) => <DashboardInner companyId={companyId} />}</RequireCompany>;
}

function DashboardInner({ companyId }: { companyId: string }) {
  const { memberships, activeCompany } = useCompany();
  const role = getActiveRole(memberships, companyId);
  const overview = useAsync(() => reportsService.overview(companyId), [companyId]);
  const tasks = useAsync(() => tasksService.list(companyId), [companyId]);
  const leads = useAsync(() => leadsService.list(companyId), [companyId]);
  const posts = useAsync(() => contentService.listPosts(companyId), [companyId]);

  const allPosts = posts.data ?? [];
  const allTasks = tasks.data ?? [];
  const allLeads = leads.data ?? [];

  const postsByStatus = groupByStatus(allPosts);
  const tasksByStatus = groupByStatus(allTasks);
  const leadsByStatus = groupByStatus(allLeads);

  const approvalQueue = allPosts.filter(needsPostAction);
  const openTasks = allTasks.filter(needsTaskAction);
  const activeLeads = allLeads.filter(needsLeadAction);

  return (
    <>
      <section className="command-hero">
        <div>
          <p className="eyebrow">Workspace command center</p>
          <h1>{activeCompany?.name ?? 'Growth Platform'}</h1>
          <p>
            A focused operating view for content approvals, lead follow-up, task execution and monthly growth reporting.
          </p>
          <div className="hero-actions">
            <Link to="/posts"><Button>Create content</Button></Link>
            <Link to="/leads"><Button variant="secondary">Add lead</Button></Link>
          </div>
        </div>
        <div className="hero-panel" aria-label="Current role and operating state">
          <span>Your active role</span>
          <strong>{roleLabel(role)}</strong>
          <p>{role ? 'Actions are shown according to your workspace role.' : 'Select an active workspace to continue.'}</p>
        </div>
      </section>

      <PageHeader
        title="Today’s operating priorities"
        subtitle="This dashboard is optimized around what needs action now, not only static totals."
      />

      <div className="stat-grid stat-grid--senior">
        <MetricCard label="Content approval queue" value={approvalQueue.length} helper="Posts needing client or agency action" tone="accent" />
        <MetricCard label="Active leads" value={activeLeads.length} helper="New, interested or waiting decision" tone="info" />
        <MetricCard label="Open tasks" value={openTasks.length} helper="Execution work not done yet" tone="warning" />
        <MetricCard label="Conversion rate" value={formatPercent(overview.data?.conversionRate)} helper="Won leads against total pipeline" tone="success" />
      </div>

      <div className="dashboard-grid dashboard-grid--senior">
        <Card className="priority-card">
          <CardHeader title="Action center" subtitle="Sorted by operational urgency across posts, leads and tasks." />
          <ActionCenter posts={approvalQueue} leads={activeLeads} tasks={openTasks} />
        </Card>

        <Card className="insight-card">
          <CardHeader title="Agency health" subtitle="Signals that help account managers control delivery." />
          <div className="insight-list">
            <Insight label="Posts ready for client" value={postsByStatus[PostStatus.READY_FOR_CLIENT]?.length ?? 0} to="/posts" />
            <Insight label="Changes requested" value={postsByStatus[PostStatus.CHANGES_REQUESTED]?.length ?? 0} to="/posts" />
            <Insight label="Leads waiting decision" value={leadsByStatus[LeadStatus.WAITING_DECISION]?.length ?? 0} to="/leads" />
            <Insight label="Blocked tasks" value={tasksByStatus[TaskStatus.BLOCKED]?.length ?? 0} to="/tasks" />
          </div>
          {overview.data?.recommendations?.length ? (
            <div className="recommendation-stack">
              <SectionHeader eyebrow="Recommendations" title="Next management moves" />
              {overview.data.recommendations.slice(0, 3).map((item) => <p key={item} className="recommendation">{item}</p>)}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="dashboard-grid dashboard-grid--senior">
        <Card>
          <CardHeader title="Content workflow" subtitle="Where every post currently sits." action={<Link to="/posts">Open board</Link>} />
          <div className="mini-pipeline">
            {[PostStatus.DRAFT, PostStatus.IN_INTERNAL_REVIEW, PostStatus.READY_FOR_CLIENT, PostStatus.APPROVED, PostStatus.SCHEDULED, PostStatus.PUBLISHED].map((status) => (
              <MiniStage key={status} label={humanize(status)} value={postsByStatus[status]?.length ?? 0} />
            ))}
          </div>
          <div className="stack-list compact-list">
            {allPosts.slice(0, 5).map((post) => <PostRow key={post.id} post={post} />)}
            {posts.loading ? <p className="muted">Loading content workflow…</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Task execution" subtitle="Current execution workload by stage." action={<Link to="/tasks">Open board</Link>} />
          <div className="mini-pipeline">
            {TASK_BOARD.map((status) => <MiniStage key={status} label={humanize(status)} value={tasksByStatus[status]?.length ?? 0} />)}
          </div>
          <div className="stack-list compact-list">
            {openTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)}
            {tasks.loading ? <p className="muted">Loading task board…</p> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

function MetricCard({ label, value, helper, tone }: { label: string; value: string | number; helper: string; tone: 'accent' | 'info' | 'warning' | 'success' }) {
  return (
    <Card className={`metric-card metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </Card>
  );
}

function Insight({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="insight-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </Link>
  );
}

function MiniStage({ label, value }: { label: string; value: number }) {
  return (
    <div className="mini-stage">
      <strong>{value}</strong>
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
