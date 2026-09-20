import { useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/State';
import { appRoutes } from '@/config/appRoutes';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { reportsService } from '@/services/reports';
import { formatDate, formatRatioPercent, humanize } from '@/utils/format';

/**
 * One monthly report, laid out to be read — by the client as much as the
 * agency. This is also the page a report notification deep-links to, and
 * what "Copy link" hands to a client who already has a login.
 *
 * "Print" uses the browser's print-to-PDF with a print stylesheet that
 * drops the app chrome, so the same page is the PDF. A login-free public
 * link is a backend ticket (a signed share token); the button for it goes
 * next to Copy link when that lands.
 */
export function ReportDetailPage() {
  const { reportId = '' } = useParams();
  return <RequireCompany>{(companyId) => <ReportDetailInner companyId={companyId} reportId={reportId} />}</RequireCompany>;
}

function ReportDetailInner({ companyId, reportId }: { companyId: string; reportId: string }) {
  const { activeCompany } = useCompany();
  const report = useAsync(() => reportsService.get(companyId, reportId), [companyId, reportId]);
  const [copied, setCopied] = useState(false);

  if (report.loading) return <DetailSkeleton />;
  if (report.error || !report.data) return <ErrorState message={report.error ?? 'Report not found.'} onRetry={report.refetch} />;

  const current = report.data;
  const title = current.title ?? `${monthName(current.month)} ${current.year} report`;
  const metrics = current.metrics;

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
        action={(
          <span className="button-row no-print">
            <ButtonLink to={appRoutes.reports} variant="secondary" size="sm">All reports</ButtonLink>
            <Button variant="secondary" size="sm" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</Button>
            <Button size="sm" onClick={() => window.print()}>Print / Save as PDF</Button>
          </span>
        )}
      />

      {/* Print only: who this is for and from, since the sidebar carries it on screen. */}
      <p className="print-only report-print__byline">
        Prepared for {activeCompany?.name ?? 'the client'} · {monthName(current.month)} {current.year}
      </p>

      {current.summary ? (
        <Card>
          <CardHeader title="Summary" />
          <div className="content-card__body"><p className="pre-wrap">{current.summary}</p></div>
        </Card>
      ) : null}

      {metrics ? (
        <>
          <div className="stat-grid stat-grid--3">
            <Metric label="Posts published" value={metrics.posts.published} helper={`${metrics.posts.total} in the period`} />
            <Metric label="Approved by you" value={metrics.posts.approved} helper={`${metrics.posts.changesRequested} sent back for changes`} />
            <Metric label="Leads won" value={metrics.leads.won} helper={`${formatRatioPercent(metrics.leads.conversionRate)} of ${metrics.leads.total} leads`} />
          </div>

          <div className="grid-2">
            <Breakdown title="Content by status" data={metrics.posts.byStatus} />
            <Breakdown title="Content by platform" data={metrics.posts.byPlatform} />
            <Breakdown title="Leads by stage" data={metrics.leads.byStatus} />
            <Breakdown title="Leads by source" data={metrics.leads.bySource} />
          </div>
        </>
      ) : (
        <Card><div className="content-card__body"><p className="muted">This report has no metrics attached.</p></div></Card>
      )}

      {current.recommendations?.length ? (
        <Card>
          <CardHeader title="Recommendations" subtitle="What your agency suggests for next month." />
          <div className="content-card__body">
            <ol className="report-recommendations">
              {current.recommendations.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>
        </Card>
      ) : null}

      {current.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <div className="content-card__body"><p className="pre-wrap">{current.notes}</p></div>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <Card className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </Card>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> | undefined }) {
  const entries = Object.entries(data ?? {}).filter(([, value]) => value > 0);
  if (entries.length === 0) return null;
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return (
    <Card>
      <CardHeader title={title} />
      <div className="content-card__body">
        <ul className="stat-bars">
          {entries.map(([key, value]) => (
            <li key={key} className="stat-bar">
              <span className="stat-bar__label">{humanize(key)}</span>
              <span className="stat-bar__track" aria-hidden="true"><span className="stat-bar__fill" style={{ width: `${(value / max) * 100}%` }} /></span>
              <span className="stat-bar__value">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString(undefined, { month: 'long' });
}

