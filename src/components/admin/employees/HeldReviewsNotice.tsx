import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';

/**
 * What deactivating this person leaves behind.
 *
 * The dashboard's per-approver breakdown already knows how many reviews
 * each person is holding. Shown the moment an admin picks a non-active
 * status, so the fourteen orphaned reviews are a decision, not a surprise.
 * Reassignment itself is per task (the Review card's Change link) until the
 * backend has a bulk re-route.
 */
export function HeldReviewsNotice({ userId }: { userId: string }) {
  const state = useAsync(() => adminDashboardService.tasks({}), [], { queryKey: queryKeys.adminWidget('tasks', {}) });
  const row = (state.data?.internalApprovalByApprover ?? []).find((item) => item.userId === userId);
  if (state.loading) return <p className="muted">Checking what they hold…</p>;
  if (!row || row.count === 0) return <p className="muted">They are not holding any review. Their open tasks stay assigned to them — reassign those from each task.</p>;
  return (
    <div className="review-note review-note--inline" role="status">
      <div>
        <p className="review-note__title">{row.count} {row.count === 1 ? 'review is' : 'reviews are'} waiting on this person</p>
        <p>Deactivating them leaves {row.count === 1 ? 'it' : 'those'} with nobody to approve. Re-route each from the task's Review card (Change approver) first, or the dashboard will count {row.count === 1 ? 'it' : 'them'} under “Approver left”.</p>
      </div>
    </div>
  );
}
