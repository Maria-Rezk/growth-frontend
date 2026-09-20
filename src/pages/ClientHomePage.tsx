import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { appRoutes } from '@/config/appRoutes';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { contentService } from '@/services/content';
import { reportsService } from '@/services/reports';
import { PostStatus, type ContentPost, type Report } from '@/types/domain';
import { formatDate, formatDateTime, humanize } from '@/utils/format';
import { formatWaiting, isWaitingLong } from '@/utils/taskReview';

/**
 * The client portal's home.
 *
 * A Client Owner logs in to answer one question — "is anything waiting on
 * me?" — and to see that the agency is delivering. This page answers both
 * and nothing else: posts waiting for their decision, oldest first; what
 * was approved, scheduled and published; and the latest report. It never
 * mentions leads, tasks or the team.
 */
export function ClientHomePage() {
  return <RequireCompany>{(companyId) => <ClientHomeInner companyId={companyId} />}</RequireCompany>;
}

/** Older than this and the client is the bottleneck — say so gently. */
const CLIENT_WAIT_HOURS = 48;

function ClientHomeInner({ companyId }: { companyId: string }) {
  const { activeCompany } = useCompany();
  const posts = useAsync(() => contentService.listPosts(companyId), [companyId], { queryKey: queryKeys.posts(companyId) });
  const reports = useAsync(() => reportsService.list(companyId), [companyId], { queryKey: queryKeys.reports(companyId) });

  const now = useMemo(() => Date.now(), [posts.data]);
  const summary = useMemo(() => summarise(posts.data ?? [], now), [now, posts.data]);
  const latestReport = useMemo(() => latest(reports.data ?? []), [reports.data]);

  return (
    <>
      <PageHeader
        title={activeCompany ? `${activeCompany.name} — Home` : 'Home'}
        subtitle="What is waiting on you, and what your agency has delivered."
        action={<ButtonLink to={appRoutes.posts} variant="secondary" size="sm">All content</ButtonLink>}
      />

      <div className="stat-grid stat-grid--3">
        <Tile label="Waiting on you" value={summary.waiting.length} tone="accent" helper="Posts that need your approval." />
        <Tile label="Approved this month" value={summary.approvedThisMonth} tone="info" helper="Ready to schedule or publish." />
        <Tile label="Published this month" value={summary.publishedThisMonth} tone="warning" helper="Live on your channels." />
      </div>

      <Card className={clsx(summary.waiting.length && 'review-panel review-panel--waiting')}>
        <CardHeader
          title="Waiting on you"
          subtitle={summary.waiting.length ? 'Oldest first. Open a post to approve it or ask for changes.' : undefined}
        />
        <div className="content-card__body">
          {posts.loading ? <ListSkeleton rows={3} /> : null}
          {posts.error ? <ErrorState message={posts.error} onRetry={posts.refetch} /> : null}
          {posts.data && summary.waiting.length === 0 ? (
            <EmptyState
              title="Nothing waiting on you"
              description="When your agency sends a post for approval it appears here, and you get a notification."
            />
          ) : null}
          {summary.waiting.length ? (
            <ul className="queue-list queue-list--flush">
              {summary.waiting.map((post) => {
                const waited = formatWaiting(post.updatedAt, now);
                const stale = isWaitingLong(post.updatedAt, now - (CLIENT_WAIT_HOURS - 24) * 3_600_000);
                return (
                  <li key={post.id} className={clsx('queue-row', stale && 'queue-row--stale')}>
                    <div className="queue-row__wait" aria-label={`Waiting ${waited}`}>
                      <strong>{waited}</strong>
                      <span>waiting</span>
                    </div>
                    <div className="queue-row__main">
                      <Link className="queue-row__title" to={appRoutes.post(post.id)}>{post.title}</Link>
                      <p className="queue-row__meta">
                        {post.platform ? <span>{humanize(post.platform)}</span> : null}
                        {post.contentType ? <><span aria-hidden="true">·</span><span>{humanize(post.contentType)}</span></> : null}
                        {post.scheduledAt ? <><span aria-hidden="true">·</span><span>planned for {formatDate(post.scheduledAt)}</span></> : null}
                      </p>
                      {post.caption ? <p className="queue-row__description">{post.caption}</p> : null}
                    </div>
                    <div className="queue-row__tags">
                      {stale ? <Badge tone="warning">Over two days</Badge> : null}
                    </div>
                    <div className="queue-row__actions">
                      <ButtonLink to={appRoutes.post(post.id)} size="sm">Review</ButtonLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </Card>

      <div className="grid-2">
        <Card>
          <CardHeader title="Coming up" subtitle="Approved and scheduled for the next seven days." />
          <div className="content-card__body">
            {posts.loading ? <ListSkeleton rows={3} /> : null}
            {posts.data && summary.upcoming.length === 0 ? (
              <p className="muted">Nothing scheduled for the coming week yet.</p>
            ) : null}
            {summary.upcoming.map((post) => (
              <div key={post.id} className="list-row">
                <div>
                  <Link className="table-link" to={appRoutes.post(post.id)}>{post.title}</Link>
                  <p className="muted">{[post.platform, post.contentType].filter(Boolean).map((v) => humanize(v)).join(' · ')}</p>
                </div>
                <div className="cell-stack" style={{ alignItems: 'flex-end' }}>
                  <StatusBadge value={post.status} />
                  <span className="muted">{formatDateTime(post.scheduledAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Latest report"
            action={<ButtonLink to={appRoutes.reports} variant="secondary" size="sm">All reports</ButtonLink>}
          />
          <div className="content-card__body">
            {reports.loading ? <ListSkeleton rows={2} /> : null}
            {reports.error ? <ErrorState message={reports.error} onRetry={reports.refetch} /> : null}
            {reports.data && !latestReport ? (
              <p className="muted">Your first monthly report will appear here once the agency generates it.</p>
            ) : null}
            {latestReport ? (
              <div className="stack-list">
                <p>
                  <Link className="table-link" to={appRoutes.report(latestReport.id)}><strong>{latestReport.title ?? `${monthName(latestReport.month)} ${latestReport.year}`}</strong></Link>
                  <span className="muted"> · generated {formatDate(latestReport.createdAt)}</span>
                </p>
                {latestReport.summary ? <p className="pre-wrap muted">{latestReport.summary}</p> : null}
                {latestReport.recommendations?.length ? (
                  <ul className="recommendation-list">
                    {latestReport.recommendations.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}

function Tile({ label, value, helper, tone }: { label: string; value: number; helper: string; tone: 'accent' | 'warning' | 'info' }) {
  return (
    <Card className={clsx('metric-card', `metric-card--${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </Card>
  );
}

function summarise(posts: ContentPost[], now: number) {
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const weekEnd = now + 7 * 24 * 3_600_000;
  const inMonth = (value?: string) => Boolean(value) && new Date(value as string).getTime() >= monthStart.getTime();

  const waiting = posts
    .filter((post) => post.status === PostStatus.READY_FOR_CLIENT)
    .sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''));

  const upcoming = posts
    .filter((post) => (post.status === PostStatus.SCHEDULED || post.status === PostStatus.APPROVED) && post.scheduledAt)
    .filter((post) => {
      const time = new Date(post.scheduledAt as string).getTime();
      return time >= now - 24 * 3_600_000 && time <= weekEnd;
    })
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));

  return {
    waiting,
    upcoming,
    approvedThisMonth: posts.filter((post) => (post.status === PostStatus.APPROVED || post.status === PostStatus.SCHEDULED) && inMonth(post.updatedAt)).length,
    publishedThisMonth: posts.filter((post) => post.status === PostStatus.PUBLISHED && inMonth(post.updatedAt)).length,
  };
}

function latest(reports: Report[]): Report | null {
  return [...reports].sort((a, b) => (b.year - a.year) || (b.month - a.month))[0] ?? null;
}

function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString(undefined, { month: 'long' });
}
