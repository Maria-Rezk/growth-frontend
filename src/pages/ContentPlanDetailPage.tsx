import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { DetailSkeleton, ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { PlusIcon } from '@/components/ui/icons';
import { appRoutes } from '@/config/appRoutes';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { contentService } from '@/services/content';
import { PostFormModal } from '@/pages/PostsPage';
import { PostStatus, type ContentPost } from '@/types/domain';
import { formatDateTime, humanize } from '@/utils/format';
import { POST_BOARD } from '@/utils/workflow';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Statuses that count as delivered for a plan: the client has said yes, or it is live. */
const DELIVERED = new Set<string>([PostStatus.APPROVED, PostStatus.SCHEDULED, PostStatus.PUBLISHED]);

/**
 * A month's plan: its posts, how far along they are, and the next one to
 * add. Plans were rows with a "View posts" link that dropped the plan on
 * the way to the posts page; this is the page that link meant.
 */
export function ContentPlanDetailPage() {
  const { planId = '' } = useParams();
  return <RequireCompany>{(companyId) => <PlanDetailInner companyId={companyId} planId={planId} />}</RequireCompany>;
}

function PlanDetailInner({ companyId, planId }: { companyId: string; planId: string }) {
  const plans = useAsync(() => contentService.listPlans(companyId), [companyId], { queryKey: queryKeys.contentPlans(companyId) });
  const posts = useAsync(() => contentService.listPosts(companyId), [companyId], { queryKey: queryKeys.posts(companyId) });
  const [createOpen, setCreateOpen] = useState(false);

  const plan = useMemo(() => (plans.data ?? []).find((item) => item.id === planId) ?? null, [planId, plans.data]);
  // Plain filters, not memos: a status that changed in place must show.
  const planPosts = (posts.data ?? []).filter((post) => post.contentPlanId === planId);
  const byStatus = POST_BOARD.map((status) => ({ status, posts: planPosts.filter((post) => post.status === status) })).filter((group) => group.posts.length);
  const delivered = planPosts.filter((post) => DELIVERED.has(post.status)).length;
  const published = planPosts.filter((post) => post.status === PostStatus.PUBLISHED).length;
  const waitingClient = planPosts.filter((post) => post.status === PostStatus.READY_FOR_CLIENT).length;

  if (plans.loading) return <DetailSkeleton />;
  if (plans.error) return <ErrorState message={plans.error} onRetry={plans.refetch} />;
  if (!plan) return <ErrorState message="Plan not found." />;

  const period = plan.month ? `${MONTHS[plan.month - 1]} ${plan.year ?? ''}`.trim() : plan.year ? String(plan.year) : '';
  const goal = (plan as { goal?: string }).goal;

  return (
    <>
      <PageHeader
        title={plan.title}
        subtitle={[period, goal].filter(Boolean).join(' · ') || 'Content plan'}
        action={(
          <span className="button-row">
            <ButtonLink to={appRoutes.contentPlans} variant="secondary" size="sm">All plans</ButtonLink>
            <RoleGate permission="posts:create">
              <Button size="sm" onClick={() => setCreateOpen(true)}><PlusIcon size={14} /> Add post</Button>
            </RoleGate>
          </span>
        )}
      />

      <div className="stat-grid stat-grid--3">
        <Tile label="Posts in plan" value={planPosts.length} helper={`${delivered} approved or later`} />
        <Tile label="Published" value={published} helper={planPosts.length ? `${Math.round((published / planPosts.length) * 100)}% of the plan` : 'Nothing yet'} />
        <Tile label="Waiting on client" value={waitingClient} helper="Sent for approval, no answer yet." />
      </div>

      {planPosts.length ? (
        <div className="plan-progress" role="img" aria-label={`${delivered} of ${planPosts.length} posts delivered`}>
          <span className="plan-progress__fill" style={{ width: `${(delivered / planPosts.length) * 100}%` }} />
        </div>
      ) : null}

      <Card>
        <CardHeader title="Posts" subtitle="Grouped by where each one sits in the workflow." />
        <div className="content-card__body">
          {posts.loading ? <ListSkeleton rows={4} /> : null}
          {posts.error ? <ErrorState message={posts.error} onRetry={posts.refetch} /> : null}
          {posts.data && planPosts.length === 0 ? (
            <EmptyState
              title="No posts in this plan yet"
              description="Add the first post here, or generate the month in the AI studio and apply it to this plan."
              action={<RoleGate permission="posts:create"><span className="button-row"><Button size="sm" onClick={() => setCreateOpen(true)}>Add the first post</Button><ButtonLink to="/ai-studio" variant="secondary" size="sm">Open AI studio</ButtonLink></span></RoleGate>}
            />
          ) : null}
          {byStatus.map((group) => (
            <div key={group.status} className="plan-group">
              <p className="eyebrow"><StatusBadge value={group.status} /> <span className="muted">{group.posts.length}</span></p>
              {group.posts.map((post: ContentPost) => (
                <div className="list-row" key={post.id}>
                  <div>
                    <Link className="table-link" to={appRoutes.post(post.id)}>{post.title}</Link>
                    <p className="muted">{[post.platform, post.contentType].filter(Boolean).map((v) => humanize(v)).join(' · ')}{post.scheduledAt ? ` · ${formatDateTime(post.scheduledAt)}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <PostFormModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} planId={planId} onCreated={() => void posts.refetch()} />
    </>
  );
}

function Tile({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </Card>
  );
}
