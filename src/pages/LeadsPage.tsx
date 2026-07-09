import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { KanbanBoard } from '@/components/domain/KanbanBoard';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { leadsService } from '@/services/leads';
import { companiesService } from '@/services/companies';
import { queryKeys } from '@/lib/queryClient';
import { fromInputDateTime, formatDateTime, humanize } from '@/utils/format';
import { LEAD_PIPELINE, groupByStatus } from '@/utils/workflow';
import { LeadStatus, LeadSource, type Lead } from '@/types/domain';

const STATUS_OPTIONS = Object.values(LeadStatus);
const SOURCE_OPTIONS = Object.values(LeadSource);
type ViewMode = 'pipeline' | 'table';
type AssigneeNameFn = (id?: string | null) => string;

// Table view paginates in small pages; the pipeline board needs a broader
// slice so the kanban columns stay representative.
const TABLE_PAGE_SIZE = 25;
const PIPELINE_PAGE_SIZE = 100;

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Lead name is required.'),
  email: z.union([z.string().trim().email('Enter a valid email address.'), z.literal('')]).optional(),
  phone: z.string().optional(),
  source: z.nativeEnum(LeadSource),
  interestedService: z.string().optional(),
  notes: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
});

type LeadForm = z.infer<typeof leadSchema>;

export function LeadsPage() {
  return <RequireCompany>{(companyId) => <LeadsInner companyId={companyId} />}</RequireCompany>;
}

function LeadsInner({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [view, setView] = useState<ViewMode>('pipeline');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const pageSize = view === 'pipeline' ? PIPELINE_PAGE_SIZE : TABLE_PAGE_SIZE;
  const filters = {
    status: status || undefined,
    source: source || undefined,
    search: debouncedSearch || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  const leads = useAsync(
    () => leadsService.listPaged(companyId, filters),
    [companyId, status, source, debouncedSearch, page, view],
    { queryKey: queryKeys.leads(companyId, filters) },
  );
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });

  // Any filter or view change restarts from page 1 so offsets stay valid.
  const setStatusFilter = (value: string) => { setStatus(value); setPage(1); };
  const setSourceFilter = (value: string) => { setSource(value); setPage(1); };
  const setSearchFilter = (value: string) => { setSearch(value); setPage(1); };
  const setViewMode = (value: ViewMode) => { setView(value); setPage(1); };

  const assigneeName = useMemo<AssigneeNameFn>(() => {
    const map = new Map<string, string>();
    (members.data ?? []).forEach((m) => map.set(m.userId, m.user?.fullName ?? m.user?.email ?? m.userId));
    return (id) => (id ? map.get(id) ?? 'Assigned' : 'Unassigned');
  }, [members.data]);

  const rows = leads.data?.items ?? [];
  const total = leads.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const grouped = groupByStatus(rows);

  const columns = useMemo<Column<Lead>[]>(() => [
    { key: 'name', header: 'Lead', sortValue: (lead) => lead.name, render: (lead) => <div><Link className="table-link" to={`/leads/${lead.id}`}>{lead.name}</Link><p className="muted">{lead.email ?? lead.phone ?? 'No contact'}</p></div> },
    { key: 'source', header: 'Source', sortValue: (lead) => lead.source ?? '', render: (lead) => lead.source ? humanize(lead.source) : '—' },
    { key: 'status', header: 'Status', sortValue: (lead) => lead.status, render: (lead) => <StatusBadge value={lead.status} /> },
    { key: 'assigned', header: 'Assigned', sortValue: (lead) => assigneeName(lead.assignedToId), render: (lead) => assigneeName(lead.assignedToId) },
    { key: 'created', header: 'Created', sortValue: (lead) => lead.createdAt ?? '', render: (lead) => formatDateTime(lead.createdAt) },
    { key: 'actions', header: '', className: 'cell-right', render: (lead) => <Link to={`/leads/${lead.id}`}><Button variant="secondary" size="sm">Open</Button></Link> },
  ], [assigneeName]);

  return (
    <>
      <PageHeader
        title="Leads pipeline"
        subtitle="Turn social inquiries and website forms into assigned, tracked sales opportunities."
        action={
          <RoleGate permission="leads:manage" fallback={<Button disabled>New lead</Button>}>
            <Button onClick={() => setCreateOpen(true)}>New lead</Button>
          </RoleGate>
        }
      />

      <div className="pipeline-summary card">
        {LEAD_PIPELINE.map((item) => (
          <button key={item} type="button" className="pipeline-summary__item" onClick={() => setStatusFilter(status === item ? '' : item)} aria-pressed={status === item}>
            <span>{humanize(item)}</span>
            <strong>{grouped[item]?.length ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="toolbar card">
        <div className="toolbar__filters">
          <Field label="Search" htmlFor="lead-search">
            <Input id="lead-search" placeholder="Search name or contact" value={search} onChange={(event) => setSearchFilter(event.target.value)} />
          </Field>
          <Field label="Status" htmlFor="lead-filter">
            <Select id="lead-filter" value={status} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
          </Field>
          <Field label="Source" htmlFor="lead-source-filter">
            <Select id="lead-source-filter" value={source} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">All sources</option>
              {SOURCE_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
          </Field>
        </div>
        <SegmentedControl<ViewMode>
          label="Lead view"
          value={view}
          onChange={setViewMode}
          options={[{ label: 'Pipeline', value: 'pipeline' }, { label: 'Table', value: 'table' }]}
        />
      </div>

      {view === 'pipeline' ? (
        <section className="board-section">
          <SectionHeader eyebrow="CRM" title="Sales pipeline board" subtitle="Use this view during daily sales review and follow-up planning." />
          <KanbanBoard columns={LEAD_PIPELINE} items={rows} renderCard={(lead) => <LeadBoardCard lead={lead} assigneeName={assigneeName(lead.assignedToId)} />} emptyText="No leads here." />
          {leads.loading ? <p className="muted">Loading pipeline…</p> : null}
          {leads.refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
          {leads.error ? <p className="error-box" role="alert">{leads.error}</p> : null}
          {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onPageChange={setPage} /> : null}
        </section>
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(lead) => lead.id} loading={leads.loading} error={leads.error} onRetry={leads.refetch} emptyTitle="No leads yet" />
          {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onPageChange={setPage} /> : null}
          {total > 0 ? <p className="muted">Showing {rows.length} of {total} leads.</p> : null}
        </>
      )}
      <LeadModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} />
    </>
  );
}

function LeadBoardCard({ lead, assigneeName }: { lead: Lead; assigneeName: string }) {
  return (
    <Link to={`/leads/${lead.id}`} className="kanban-card">
      <div className="kanban-card__head">
        <strong>{lead.name}</strong>
        <StatusBadge value={lead.status} />
      </div>
      <p>{lead.email ?? lead.phone ?? lead.interestedService ?? 'No contact details yet.'}</p>
      <div className="kanban-card__meta">
        <span>{lead.source ? humanize(lead.source) : 'No source'}</span>
        <span>{assigneeName}</span>
      </div>
      <div className="kanban-card__footer">
        <span>Updated</span>
        <strong>{formatDateTime(lead.updatedAt ?? lead.createdAt)}</strong>
      </div>
    </Link>
  );
}

function LeadModal({ open, companyId, onClose }: { open: boolean; companyId: string; onClose: () => void }) {
  const create = useMutation(leadsService.create, { invalidateKeys: [['companies', companyId, 'leads']] });
  const form = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    defaultValues: { name: '', email: '', phone: '', source: LeadSource.INSTAGRAM, interestedService: '', notes: '', nextFollowUpAt: '' },
    mode: 'onBlur',
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await create.mutate(companyId, {
      name: values.name.trim(),
      email: values.email || undefined,
      phone: values.phone,
      source: values.source,
      interestedService: values.interestedService,
      notes: values.notes,
      nextFollowUpAt: fromInputDateTime(values.nextFollowUpAt ?? ''),
      // no status — backend sets NEW
    });
    if (result) {
      toast.success('Lead created.');
      form.reset();
      onClose();
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Create lead" footer={<><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" form="lead-form" loading={form.formState.isSubmitting || create.loading}>Create lead</Button></>}>
      <form id="lead-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="lead-name" error={form.formState.errors.name?.message}>
          <Input id="lead-name" {...form.register('name')} />
        </Field>
        <div className="grid-2">
          <Field label="Email" htmlFor="lead-email" error={form.formState.errors.email?.message}>
            <Input id="lead-email" type="email" {...form.register('email')} />
          </Field>
          <Field label="Phone" htmlFor="lead-phone" error={form.formState.errors.phone?.message}>
            <Input id="lead-phone" {...form.register('phone')} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Source" htmlFor="lead-source" error={form.formState.errors.source?.message}>
            <Select id="lead-source" {...form.register('source')}>
              {SOURCE_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
          </Field>
          <Field label="Next follow-up" htmlFor="lead-followup">
            <Input id="lead-followup" type="datetime-local" {...form.register('nextFollowUpAt')} />
          </Field>
        </div>
        <Field label="Interested service" htmlFor="lead-service" hint="What the lead asked about.">
          <Input id="lead-service" {...form.register('interestedService')} />
        </Field>
        <Field label="Notes" htmlFor="lead-notes">
          <Textarea id="lead-notes" rows={3} {...form.register('notes')} />
        </Field>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}