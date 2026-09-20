import { ButtonLink } from '@/components/ui/Button';
import { appRoutes } from '@/config/appRoutes';
import type { Report } from '@/types/domain';

/**
 * "Last month's report has not been generated." Shown on the client
 * overview from the 1st until the report exists. Report generation was
 * manual and silent; nothing reminded the Account Manager it was due.
 */
export function ReportDueNotice({ reports, loading }: { reports: Report[] | null; loading: boolean }) {
  if (loading || !reports) return null;
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = last.getMonth() + 1;
  const year = last.getFullYear();
  const exists = reports.some((report) => report.month === month && report.year === year);
  if (exists) return null;
  const label = last.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="review-note notice-row" role="status">
      <div>
        <p className="review-note__title">{label} report not generated yet</p>
        <p>The client's monthly report is due. It pulls posts, approvals and leads for the period — about a minute.</p>
      </div>
      <ButtonLink to={appRoutes.reports} size="sm">Generate it</ButtonLink>
    </div>
  );
}
