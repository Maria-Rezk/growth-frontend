import { useParams } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { ReportBody, monthName } from '@/components/domain/ReportBody';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Card';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { reportsService } from '@/services/reports';
import { formatDate } from '@/utils/format';

/**
 * A monthly report opened from a public link — no login, no app chrome.
 *
 * A wrong, revoked or expired token is a 404 (never 403, which would confirm
 * the report exists); all three read the same to the visitor.
 */
export function PublicReportPage() {
  const { token = '' } = useParams();
  const report = useAsync(() => reportsService.getPublic(token), [token], { queryKey: ['public-report', token] });
  const title = report.data ? report.data.title ?? `${monthName(report.data.month)} ${report.data.year} report` : 'Report';
  usePageTitle(title);

  return (
    <main className="public-report">
      <header className="public-report__brand no-print">
        <Logo height={28} title="Solu1ions Business Development" />
      </header>

      {report.loading ? <DetailSkeleton /> : null}

      {!report.loading && report.errorStatus === 404 ? (
        <EmptyState
          title="This link is not valid"
          description="It may have expired or been turned off. Ask whoever sent it for a new link."
        />
      ) : null}

      {!report.loading && report.error && report.errorStatus !== 404 ? (
        <ErrorState message={report.errorStatus === 429 ? 'Too many requests. Wait a minute and try again.' : report.error} onRetry={report.refetch} />
      ) : null}

      {report.data ? (
        <div className="report-print">
          <PageHeader
            title={title}
            subtitle={`Prepared for ${report.data.company.name} · ${monthName(report.data.month)} ${report.data.year}`}
            action={<Button size="sm" variant="secondary" className="no-print" onClick={() => window.print()}>Save as PDF</Button>}
          />
          <p className="print-only report-print__byline">
            Prepared for {report.data.company.name} · {monthName(report.data.month)} {report.data.year}
          </p>
          <ReportBody report={report.data} audience="public" />
          <p className="public-report__footer no-print">
            Shared by Solu1ions Business Development. This link works until {formatDate(report.data.sharedUntil)}.
          </p>
        </div>
      ) : null}
    </main>
  );
}
