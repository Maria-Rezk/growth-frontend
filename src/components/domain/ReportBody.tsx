import { Card, CardHeader } from '@/components/ui/Card';
import type { Report } from '@/types/domain';
import { formatAmount, formatRatioPercent, humanize } from '@/utils/format';
import { LOST_REASON_LABELS } from '@/utils/leadFollowUp';

/**
 * A monthly report's content: summary, figures, breakdowns, recommendations.
 * Shared by the in-app report page and the login-free public view, so the
 * client sees the same document either way. Agency notes are not part of it.
 */
export function ReportBody({
  report,
  audience = 'app',
}: {
  report: Pick<Report, 'summary' | 'metrics' | 'recommendations'>;
  /** `public`: the reader may not be the approver, so nothing is addressed to "you". */
  audience?: 'app' | 'public';
}) {
  const metrics = report.metrics;
  const hasWonValue = typeof metrics?.leads.wonValue === 'number' && metrics.leads.wonValue > 0;

  return (
    <>
      {report.summary ? (
        <Card>
          <CardHeader title="Summary" />
          <div className="content-card__body"><p className="pre-wrap">{report.summary}</p></div>
        </Card>
      ) : null}

      {metrics ? (
        <>
          <div className={hasWonValue ? 'stat-grid' : 'stat-grid stat-grid--3'}>
            <Metric label="Posts published" value={String(metrics.posts.published)} helper={`${metrics.posts.total} in the period`} />
            <Metric label={audience === 'public' ? 'Posts approved' : 'Approved by you'} value={String(metrics.posts.approved)} helper={`${metrics.posts.changesRequested} sent back for changes`} />
            <Metric label="Leads won" value={String(metrics.leads.won)} helper={`${formatRatioPercent(metrics.leads.conversionRate)} of ${metrics.leads.total} leads`} />
            {hasWonValue ? <Metric label="Won value" value={formatAmount(metrics.leads.wonValue)} helper={`Across ${metrics.leads.won} won lead${metrics.leads.won === 1 ? '' : 's'}`} /> : null}
          </div>

          <div className="grid-2">
            <Breakdown title="Content by status" data={metrics.posts.byStatus} />
            <Breakdown title="Content by platform" data={metrics.posts.byPlatform} />
            <Breakdown title="Leads by stage" data={metrics.leads.byStatus} />
            <Breakdown title="Leads by source" data={metrics.leads.bySource} />
            <Breakdown
              title="Why leads were lost"
              data={metrics.leads.byLostReason}
              label={(key) => LOST_REASON_LABELS[key as keyof typeof LOST_REASON_LABELS] ?? humanize(key)}
            />
          </div>
        </>
      ) : (
        <Card><div className="content-card__body"><p className="muted">This report has no metrics attached.</p></div></Card>
      )}

      {report.recommendations?.length ? (
        <Card>
          <CardHeader title="Recommendations" subtitle={audience === 'public' ? 'Suggested focus for next month.' : 'What your agency suggests for next month.'} />
          <div className="content-card__body">
            <ol className="report-recommendations">
              {report.recommendations.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Card className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </Card>
  );
}

function Breakdown({ title, data, label = humanize }: { title: string; data: Record<string, number> | undefined; label?: (key: string) => string }) {
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
              <span className="stat-bar__label">{label(key)}</span>
              <span className="stat-bar__track" aria-hidden="true"><span className="stat-bar__fill" style={{ width: `${(value / max) * 100}%` }} /></span>
              <span className="stat-bar__value">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString(undefined, { month: 'long' });
}
