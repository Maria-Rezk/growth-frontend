import { Link, useLocation } from 'react-router-dom';
import { ClockIcon } from '@/components/ui/icons';
import { appRoutes } from '@/config/appRoutes';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { useClientView } from '@/hooks/useClientView';
import { queryKeys } from '@/lib/queryClient';
import { contentService } from '@/services/content';
import { myReviewsService } from '@/services/myWork';
import { PostStatus } from '@/types/domain';
import { hoursSince } from '@/utils/taskReview';

/** A review is "late" after a day on the agency side, two on the client's. */
const STAFF_HOURS = 24;
const CLIENT_HOURS = 48;
const BANNER_PAGE = 25;

/**
 * The nudge: one line under the topbar when something has waited on the
 * signed-in person past the threshold, on every page, until they deal with
 * it. This is the in-app half of ageing notifications; the email digest is
 * the backend's half and lands as `REVIEW_WAITING_24H` in the feed.
 *
 * Reads the same queries the queue and the client Home use, so it costs no
 * extra request once either page has loaded.
 */
export function WaitingBanner() {
  const { isClient, ready } = useClientView();
  if (!ready) return null;
  return isClient ? <ClientBanner /> : <StaffBanner />;
}

function StaffBanner() {
  const { companies } = useCompany();
  const location = useLocation();
  // Same key as the queue page's first page, so one request serves both.
  const reviews = useAsync(
    () => myReviewsService.list({ limit: BANNER_PAGE, offset: 0 }),
    [],
    { queryKey: queryKeys.meApprovalQueue({ limit: BANNER_PAGE }), enabled: companies.length > 0 },
  );

  const items = reviews.data?.items ?? [];
  const late = items.filter((task) => (hoursSince(task.submittedForReviewAt) ?? 0) >= STAFF_HOURS);
  // The queue page is where they deal with it; nagging on it is noise.
  if (late.length === 0 || location.pathname === appRoutes.approvals) return null;

  // Oldest first: if the whole page is late, more may be past it.
  const moreBeyond = late.length === items.length && (reviews.data?.total ?? 0) > items.length;
  const oldest = Math.floor(Math.max(...late.map((task) => hoursSince(task.submittedForReviewAt) ?? 0)) / 24);
  return (
    <Banner to={appRoutes.approvals}>
      <strong>{late.length === 1 && !moreBeyond ? 'A review has' : `${late.length}${moreBeyond ? '+' : ''} reviews have`}</strong> waited on you for over a day
      {oldest > 1 ? <> — the oldest for {oldest} days</> : null}. Open the queue →
    </Banner>
  );
}

function ClientBanner() {
  const { activeCompanyId } = useCompany();
  const location = useLocation();
  const posts = useAsync(
    () => contentService.listPosts(activeCompanyId ?? ''),
    [activeCompanyId],
    { queryKey: queryKeys.posts(activeCompanyId ?? ''), enabled: Boolean(activeCompanyId) },
  );

  const late = (posts.data ?? []).filter(
    (post) => post.status === PostStatus.READY_FOR_CLIENT && (hoursSince(post.updatedAt) ?? 0) >= CLIENT_HOURS,
  );
  if (late.length === 0 || location.pathname === appRoutes.clientHome) return null;

  return (
    <Banner to={appRoutes.clientHome}>
      <strong>{late.length === 1 ? 'A post is' : `${late.length} posts are`}</strong> waiting for your approval — your agency cannot schedule {late.length === 1 ? 'it' : 'them'} until you decide. Review now →
    </Banner>
  );
}

function Banner({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="waiting-banner" role="status">
      <ClockIcon size={16} />
      <span>{children}</span>
    </Link>
  );
}
