import { FormEvent, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Fields';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { reportsService } from '@/services/reports';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, humanize, formatPercent } from '@/utils/format';
import type { Report } from '@/types/domain';

export function ReportsPage() {
  return <RequireCompany>{(companyId) => <ReportsInner companyId={companyId} />}</RequireCompany>;
}

function ReportsInner({ companyId }: { companyId: string }) {
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

  const columns = useMemo<Column<Report>[]>(() => [
    { key: 'period', header: 'Period', render: (report) => `${report.month}/${report.year}` },
    { key: 'created', header: 'Created', render: (report) => formatDateTime(report.createdAt) },
    { key: 'posts', header: 'Posts', render: (report) => report.metrics?.posts.total ?? '—' },
    { key: 'leads', header: 'Leads', render: (report) => report.metrics?.leads.total ?? '—' },
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

  return (
    <>
      <PageHeader title="Reports" subtitle="Overview metrics, monthly report generation and recommendations." />
      <form className="filter-card filter-card--spread" onSubmit={submit}>
        <div className="filter-row">
          <Field label="Month" htmlFor="month" error={monthError ?? undefined}>
            <Input id="month" type="number" min={1} max={12} value={month} onChange={(event) => setMonth(Number(event.target.value))} />
          </Field>
          <Field label="Year" htmlFor="year">
            <Input id="year" type="number" min={2024} value={year} onChange={(event) => setYear(Number(event.target.value))} />
          </Field>
        </div>
        <Field label="Notes (optional)" htmlFor="notes" hint="Included with the generated report — e.g. performance summary or recommendations.">
          <Textarea id="notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <Button type="submit" loading={generate.loading}>Generate monthly report</Button>
      </form>

      <div className="stat-grid">
        <MetricCard label="Posts" value={overview.data?.postsTotal ?? 0} />
        <MetricCard label="Leads" value={overview.data?.leadsTotal ?? 0} />
        <MetricCard label="Conversion" value={formatPercent(overview.data?.conversionRate)} />
      </div>

      <div className="dashboard-grid">
        <Breakdown title="Posts by status" data={overview.data?.postsByStatus} />
        <Breakdown title="Leads by status" data={overview.data?.leadsByStatus} />
      </div>

      <Card className="content-card">
        <CardHeader title="Recommendations" />
        <div className="content-card__body stack-list">
          {overview.loading ? <p className="muted">Loading recommendations…</p> : null}
          {overview.data?.recommendations?.length ? overview.data.recommendations.map((item) => <p key={item} className="recommendation">{item}</p>) : <p className="muted">No recommendations returned.</p>}
        </div>
      </Card>

      <DataTable columns={columns} rows={reports.data ?? []} rowKey={(report) => report.id} loading={reports.loading} error={reports.error} onRetry={reports.refetch} emptyTitle="No generated reports" />
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return <Card className="metric-card"><span>{label}</span><strong>{value}</strong></Card>;
}

function Breakdown({ title, data }: { title: string; data?: Record<string, number> }) {
  const entries = Object.entries(data ?? {});
  return (
    <Card className="content-card"><CardHeader title={title} /><div className="content-card__body stack-list">{entries.length ? entries.map(([key, value]) => <div className="list-row" key={key}><span>{humanize(key)}</span><strong>{value}</strong></div>) : <p className="muted">No data.</p>}</div></Card>
  );
}