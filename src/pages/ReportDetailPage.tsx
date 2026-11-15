import { useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, RecordNotFound } from '@/components/ui/State';
import { RoleGate } from '@/components/domain/RoleGate';
import { ReportBody } from '@/components/domain/ReportBody';
import { ReportShareDialog } from '@/components/domain/ReportShareDialog';
import { appRoutes } from '@/config/appRoutes';
import { usePermission } from '@/hooks/usePermission';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { reportsService } from '@/services/reports';
import { formatDate, monthName } from '@/utils/format';

/**
 * One monthly report, laid out to be read — by the client as much as the
 * agency. This is also the page a report notification deep-links to, and
 * what "Copy link" hands to a client who already has a login. For someone
 * without one, an Account Manager mints a public link (ReportShareDialog).
 *
 * "Print" uses the browser's print-to-PDF with a print stylesheet that
 * drops the app chrome, so the same page is the PDF.
 */
export function ReportDetailPage() {
  const { reportId = '' } = useParams();
  return (
    <RequireCompany>
      {(companyId) => (
        <RoleGate
          permission="reports:list"
          fallback={<EmptyState title="This report is not available to your role" description="The Account Manager can share a report with you as a link." />}
        >
          <ReportDetailInner companyId={companyId} reportId={reportId} />
        </RoleGate>
      )}
    </RequireCompany>
  );
}

function ReportDetailInner({ companyId, reportId }: { companyId: string; reportId: string }) {
  const { activeCompany } = useCompany();
  const canShare = usePermission('reports:share');
  const report = useAsync(() => reportsService.get(companyId, reportId), [companyId, reportId], { queryKey: queryKeys.report(companyId, reportId) });
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (report.loading) return <DetailSkeleton />;
  if (report.errorStatus === 404) return <RecordNotFound title="Report not found" backTo={appRoutes.reports} backLabel="Back to reports" />;
  if (report.error || !report.data) return <ErrorState message={report.error ?? 'Report not found.'} onRetry={report.refetch} />;

  const current = report.data;
  const title = current.title ?? `${monthName(current.month)} ${current.year} report`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Link copied. Anyone with access to this client can open it.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the address bar and copy it from there.');
    }
  };

  return (
    <div className="report-print">
      <PageHeader
        title={title}
        subtitle={`${activeCompany?.name ?? ''} · ${monthName(current.month)} ${current.year} · generated ${formatDate(current.createdAt)}`}
        back={{ to: appRoutes.reports, label: 'Back to reports' }}
        action={(
          <span className="button-row no-print">
            <Button variant="secondary" size="sm" onClick={copyLink} title="For people who already sign in to this client">{copied ? 'Copied' : 'Copy app link'}</Button>
            {canShare ? <Button variant="secondary" size="sm" onClick={() => setSharing(true)}>Share publicly</Button> : null}
            <Button size="sm" onClick={() => window.print()}>Print / Save as PDF</Button>
          </span>
        )}
      />

      {/* Print only: who this is for and from, since the sidebar carries it on screen. */}
      <p className="print-only report-print__byline">
        Prepared for {activeCompany?.name ?? 'the client'} · {monthName(current.month)} {current.year}
      </p>

      {canShare ? <ReportShareDialog open={sharing} onClose={() => setSharing(false)} companyId={companyId} reportId={reportId} /> : null}

      <ReportBody report={current} />

      {current.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <div className="content-card__body"><p className="pre-wrap">{current.notes}</p></div>
        </Card>
      ) : null}
    </div>
  );
}


