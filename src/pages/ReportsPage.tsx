import { FormEvent, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Fields';
import { ErrorState } from '@/components/ui/State';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { CommitmentPanel } from '@/components/domain/CommitmentPanel';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useCompany } from '@/context/CompanyContext';
import { reportsService } from '@/services/reports';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, humanize, formatPercent } from '@/utils/format';
import type { Report } from '@/types/domain';

export function ReportsPage() {
  return <RequireCompany>{(companyId) => <ReportsInner companyId={companyId} />}</RequireCompany>;
}

function ReportsInner({ companyId }: { companyId: string }) {
  const { activeCompany } = useCompany();
  const current = new Date();
  const [month, setMonth] = useState(current.getMonth() + 1);
  const [year, setYear] = useState(current.getFullYear());
  const [notes, setNotes] = useState('');
  const [monthError, setMonthError] = useState<string | null>(null);

  const period = { month, year };
  const overview = useAsync(
    () => reportsService.overview(companyId, period),
    [companyId, month, year],
    { queryKey: queryKeys.reportOverview(companyId, period) },
  );
  const reports = useAsync(
    () => reportsService.list(companyId),
    [companyId],
    { queryKey: queryKeys.reports(companyId) },
  );
  const generate = useMutation(reportsService.generateMonthly, {
    invalidateKeys: [['companies', companyId, 'reports']],
  });

  /*
    No column here is alphabetical — a report is identified by the month it
    covers, not a name — so this table opens newest period first rather than
    A→Z. `3/2026` is displayed but sorted as `2026-03`: sorting the rendered
    string would order months 1, 10, 11, 12, 2.
  */
  const columns = useMemo<Column<Report>[]>(() => [
    {
      key: 'period',
      header: 'Period',
      sortValue: (report) => `${report.year}-${String(report.month).padStart(2, '0')}`,
      render: (report) => `${report.month}/${report.year}`,
    },
    {
      key: 'created',
      header: 'Created',
      sortValue: (report) => report.createdAt ?? '',
      render: (report) => formatDateTime(report.createdAt),
    },
    {
      key: 'posts',
      header: 'Posts',
      sortValue: (report) => report.metrics?.posts.total ?? 0,
      render: (report) => report.metrics?.posts.total ?? '—',
    },
    {
      key: 'leads',
      header: 'Leads',
      sortValue: (report) => report.metrics?.leads.total ?? 0,
      render: (report) => report.metrics?.leads.total ?? '—',
    },
  ], []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (month < 1 || month > 12) {
      setMonthError('Month must be between 1 and 12.');
      return;
    }
    setMonthError(null);
    const result = await generate.mutate(companyId, {
      month,
      year,
      notes: notes.trim() || undefined,
    });
    if (result) {
      toast.success('Monthly report generated.');
      setNotes('');
    } else if (generate.error) {
      toast.error(generate.error);
    }
  };

  // Reports the team has actually generated for the selected period — the
  // delivered side of the "monthly report" commitment line.
  const reportsInPeriod = (reports.data ?? []).filter(
    (report) => report.month === month && report.year === year,
  ).length;

  return (
    <>
      <PageHeader title="Reports" subtitle="Are we behind on what we promised, and what has shipped so far." />

      <CommitmentPanel
        companyId={companyId}
        companyName={activeCompany?.name ?? 'this client'}
        month={month}
        year={year}
        overview={overview.data}
        overviewLoading={overview.loading}
        reportsInPeriod={reportsInPeriod}
      />

      <Card>
        <CardHeader title="Generate monthly report" subtitle="Metrics are calculated for the selected period." />
        <form className="form-card form-grid" onSubmit={submit}>
          <div className="grid-2">
            <Field label="Month" htmlFor="month" error={monthError ?? undefined}>
              <Input id="month" type="number" min={1} max={12} value={month} onChange={(event) => setMonth(Number(event.target.value))} />
            </Field>
            <Field label="Year" htmlFor="year">
              <Input id="year" type="number" min={2024} value={year} onChange={(event) => setYear(Number(event.target.value))} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="notes" hint="Optional. Included with the generated report.">
            <Textarea id="notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <div className="form-actions">
            <Button type="submit" loading={generate.loading}>Generate report</Button>
          </div>
        </form>
      </Card>

      {/* A failed overview left every metric reading 0, which is
          indistinguishable from a period with no activity. */}
      {overview.error ? (
        <Card><ErrorState message={overview.error} onRetry={overview.refetch} /></Card>
      ) : null}

      <div className="stat-grid stat-grid--3">
        <MetricCard label="Posts" value={metric(overview.data?.postsTotal, overview.loading)} />
        <MetricCard label="Leads" value={metric(overview.data?.leadsTotal, overview.loading)} />
        <MetricCard
          label="Conversion"
          value={metric(overview.data ? formatPercent(overview.data.conversionRate) : undefined, overview.loading)}
        />
      </div>

      <div className="dashboard-grid">
        <Breakdown title="Posts by status" data={overview.data?.postsByStatus} loading={overview.loading} />
        <Breakdown title="Leads by status" data={overview.data?.leadsByStatus} loading={overview.loading} />
      </div>

      <Card>
        <CardHeader title="Recommendations" />
        <div className="content-card__body stack-list">
          {overview.loading ? <p className="muted">Loading recommendations…</p> : null}
          {overview.data?.recommendations?.length ? overview.data.recommendations.map((item) => <p key={item} className="recommendation">{item}</p>) : <p className="muted">No recommendations returned.</p>}
        </div>
      </Card>

      <DataTable columns={columns} rows={reports.data ?? []} rowKey={(report) => report.id} loading={reports.loading} error={reports.error} onRetry={reports.refetch} emptyTitle="No generated reports" defaultSortKey="period" defaultSortDirection="desc" />
    </>
  );
}

/** `—` rather than `0` when a number is loading or unavailable. */
function metric(value: number | string | undefined, loading: boolean): string {
  if (loading) return '—';
  return value === undefined || value === null ? '—' : String(value);
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

function Breakdown({ title, data, loading }: { title: string; data?: Record<string, number>; loading: boolean }) {
  const entries = Object.entries(data ?? {});
  return (
    <Card>
      <CardHeader title={title} />
      <div className="content-card__body stack-list">
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading && entries.length === 0 ? <p className="muted">No data for this period.</p> : null}
        {!loading && entries.map(([key, value]) => (
          <div className="list-row" key={key}>
            <span>{humanize(key)}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}