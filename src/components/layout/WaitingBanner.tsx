import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClockIcon } from '@/components/ui/icons';
import { appRoutes } from '@/config/appRoutes';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { useClientView } from '@/hooks/useClientView';
import { queryKeys } from '@/lib/queryClient';
import { contentService } from '@/services/content';
import { myReviewsService } from '@/services/myWork';
import { PostStatus } from '@/types/domain';
import { readStored, writeStored } from '@/lib/storage';
import { type BannerSnooze, endOfLocalDay, snoozeCovers } from '@/utils/bannerSnooze';
import { hoursSince } from '@/utils/taskReview';

/** A review is "late" after a day on the agency side, two on the client's. */
const STAFF_HOURS = 24;
const CLIENT_HOURS = 48;
const BANNER_PAGE = 25;

/*
  "Snooze for today" (F-28). What the banner says is never urgent on its own
  (late reviews, posts awaiting the client) and every item stays reachable
  from the queue, the client Home and the notifications feed. So hiding it is
  safe, as long as it can never hide something the person has not seen:

  - It is per signed-in user: the key carries the user id.
  - It hides exactly what was on screen. Each late item is recorded with how
    many whole days it had waited; a newly late item, or one passing into
    another day (the 24h -> 48h escalation the feed also sends), shows the
    banner again at once.
  - When the staff page is all late and more exist beyond it, the total is
    recorded too, and any growth shows the banner again.
  - It lasts until local midnight, then the banner returns.
*/
const SNOOZE_VERSION = 1;
const snoozeKey = (userId: string) => `growth.waiting-banner.snooze.${userId}`;

/** The snooze state for this user and this set of late items. */
function useSnooze(current: BannerSnooze) {
  const { user } = useAuth();
  const key = user ? snoozeKey(user.id) : null;
  // Bumped on snoozing, so the stored value is re-read on the next render.
  const [, setRevision] = useState(0);
  const stored = key ? readStored<BannerSnooze>('local', key, SNOOZE_VERSION)?.data ?? null : null;
  const snoozed = snoozeCovers(stored, current);
  const snooze = key
    ? () => {
        writeStored('local', key, SNOOZE_VERSION, current, endOfLocalDay() - Date.now());
        setRevision((value) => value + 1);
        // The banner's own button disappears with it: land focus somewhere stable, and say what happened.
        document.getElementById('main-content')?.focus({ preventScroll: true });
        toast.success('Reminder hidden until tomorrow. Anything newly late will still show it.');
      }
    : undefined;
  return { snoozed, snooze };
}

const daysWaited = (hours: number) => Math.floor(hours / 24);

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
  // Oldest first: if the whole page is late, more may be past it.
  const moreBeyond = late.length > 0 && late.length === items.length && (reviews.data?.total ?? 0) > items.length;
  const { snoozed, snooze } = useSnooze({
    items: late.map((task) => `${task.id}@${daysWaited(hoursSince(task.submittedForReviewAt) ?? 0)}`),
    ...(moreBeyond ? { total: reviews.data?.total ?? 0 } : {}),
  });
  // The queue page is where they deal with it; nagging on it is noise.
  if (late.length === 0 || snoozed || location.pathname === appRoutes.approvals) return null;

  const oldest = Math.floor(Math.max(...late.map((task) => hoursSince(task.submittedForReviewAt) ?? 0)) / 24);
  return (
    <Banner to={appRoutes.approvals} onSnooze={snooze}>
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
  const { snoozed, snooze } = useSnooze({ items: late.map((post) => `${post.id}@${daysWaited(hoursSince(post.updatedAt) ?? 0)}`) });
  if (late.length === 0 || snoozed || location.pathname === appRoutes.clientHome) return null;

  return (
    <Banner to={appRoutes.clientHome} onSnooze={snooze}>
      <strong>{late.length === 1 ? 'A post is' : `${late.length} posts are`}</strong> waiting for your approval — your agency cannot schedule {late.length === 1 ? 'it' : 'them'} until you decide. Review now →
    </Banner>
  );
}

/*
  A region holding a link and a button, not a link carrying role="status":
  that role replaced the link's own, so screen readers did not offer it as a
  link, and a button cannot sit inside a link.
*/
function Banner({ to, onSnooze, children }: { to: string; onSnooze?: () => void; children: React.ReactNode }) {
  return (
    <div className="waiting-banner" role="region" aria-label="Reminder">
      <Link to={to} className="waiting-banner__link">
        <ClockIcon size={16} />
        <span>{children}</span>
      </Link>
      {onSnooze ? (
        // "for today" is read out everywhere, only shown where there is room for it.
        <button type="button" className="waiting-banner__snooze" onClick={onSnooze}>
          Snooze<span className="waiting-banner__snooze-when"> for today</span>
        </button>
      ) : null}
    </div>
  );
}
