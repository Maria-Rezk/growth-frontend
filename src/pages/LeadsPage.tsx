import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { KanbanBoard } from '@/components/domain/KanbanBoard';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useUrlFilters } from '@/hooks/useDashboardFilters';
import { applyServerFieldErrors } from '@/lib/forms';
import { leadsService } from '@/services/leads';
import { companiesService } from '@/services/companies';
import { queryKeys } from '@/lib/queryClient';
import { fromInputDateTime, formatDateTime, humanize } from '@/utils/format';
import { LEAD_PIPELINE } from '@/utils/workflow';
import { LeadStatus, LeadSource, type Lead, type Membership } from '@/types/domain';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { BoardSkeleton } from '@/components/ui/Skeleton';
import { useTaskActor } from '@/hooks/useTaskActor';
import { Badge } from '@/components/ui/Badge';
import { AssigneeOptions, assigneeUserId, assigneeValueFor } from '@/components/domain/AssigneeOptions';
import { contactLinks, followUpBucket, isAdrift, isOpenLead, looksLikeDuplicate, type FollowUpBucket } from '@/utils/leadFollowUp';
import { formatWaiting } from '@/utils/taskReview';

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
  assignedToId: z.string().optional(),
});

type LeadForm = z.infer<typeof leadSchema>;

export function LeadsPage() {
  return <RequireCompany>{(companyId) => <LeadsInner companyId={companyId} />}</RequireCompany>;
}

const LEAD_FILTER_DEFAULTS = { status: '', source: '', search: '', view: 'pipeline', page: '1', scope: 'all', due: '' } as const;
type Scope = 'all' | 'mine';
type DueFilter = '' | 'overdue' | 'today' | 'week' | 'none';

function LeadsInner({ companyId }: { companyId: string }) {
  // Filters and the page live in the URL so a filtered pipeline is a link,
  // and Back from a lead lands on the same page of the same list.
  const [urlFilters, setUrlFilters] = useUrlFilters<Record<keyof typeof LEAD_FILTER_DEFAULTS, string>>(LEAD_FILTER_DEFAULTS);
  const { status, source, search } = urlFilters;
  const scope = (urlFilters.scope === 'mine' ? 'mine' : 'all') as Scope;
  const due = (['overdue', 'today', 'week', 'none'].includes(urlFilters.due) ? urlFilters.due : '') as DueFilter;
  const { userId } = useTaskActor();
  const view = (urlFilters.view === 'table' ? 'table' : 'pipeline') as ViewMode;
  const page = Math.max(1, Number.parseInt(urlFilters.page, 10) || 1);
  const setStatus = (value: string) => setUrlFilters({ status: value });
  const setSource = (value: string) => setUrlFilters({ source: value });
  const setSearch = (value: string) => setUrlFilters({ search: value });
  const setView = (value: ViewMode) => setUrlFilters({ view: value });
  const setPage = (value: number) => setUrlFilters({ page: String(value) });
  const setScope = (value: Scope) => setUrlFilters({ scope: value, page: '1' });
  const setDue = (value: DueFilter) => setUrlFilters({ due: value, page: '1' });
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);

  const pageSize = view === 'pipeline' ? PIPELINE_PAGE_SIZE : TABLE_PAGE_SIZE;
  const filters = {
    status: status || undefined,
    source: source || undefined,
    search: debouncedSearch || undefined,
    assignedToId: scope === 'mine' && userId ? userId : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  const leads = useAsync(
    () => leadsService.listPaged(companyId, filters),
    [companyId, status, source, debouncedSearch, page, view],
    { queryKey: queryKeys.leads(companyId, filters) },
  );

  /*
    Counts come from their own request, deliberately WITHOUT the status
    filter. Deriving them from `leads.data.items` meant clicking a tile
    filtered the list and then zeroed every other tile — the control
    destroyed its own readout. Search and source still apply, so the tiles
    answer "how many leads match my search, per stage".
  */
  const countFilters = { source: source || undefined, search: debouncedSearch || undefined };
  const counts = useAsync(
    () => leadsService.statusCounts(companyId, LEAD_PIPELINE, countFilters),
    [companyId, source, debouncedSearch],
    { queryKey: queryKeys.leadCounts(companyId, countFilters) },
  );

  const members = useAsync(
    () => companiesService.members(companyId),
    [companyId],
    { queryKey: queryKeys.companyMembers(companyId) },
  );

  /*
    The follow-up tiles are the agent's day: overdue, today, this week, and
    the leads nobody has scheduled. They read an unfiltered list (scope only,
    like the task alerts) so a status filter cannot make "overdue" read 0.
  */
  const allLeads = useAsync(
    () => leadsService.list(companyId, scope === 'mine' && userId ? { assignedToId: userId } : undefined),
    [companyId, scope, userId],
    { queryKey: [...queryKeys.leads(companyId, { scope, userId }), 'follow-up'] },
  );
  const followUp = useMemo(() => {
    const open = (allLeads.data ?? []).filter(isOpenLead);
    const count = (bucket: FollowUpBucket) => open.filter((lead) => followUpBucket(lead) === bucket).length;
    return { overdue: count('overdue'), today: count('today'), week: count('week'), none: open.filter(isAdrift).length };
  }, [allLeads.data]);

  // Any filter or view change restarts from page 1 so offsets stay valid.
  const setStatusFilter = (value: string) => { setStatus(value); setPage(1); };
  const setSourceFilter = (value: string) => { setSource(value); setPage(1); };
  const setSearchFilter = (value: string) => { setSearch(value); setPage(1); };
  const setViewMode = (value: ViewMode) => { setView(value); setPage(1); };

  const assigneeName = useMemo<AssigneeNameFn>(() => {
    const map = new Map<string, string>();
    (members.data ?? []).forEach((m) => map.set(m.userId, m.user?.fullName ?? m.user?.email ?? m.userId));
    // While members are still loading, say so rather than claiming "Assigned"
    // for a name we simply haven't fetched yet.
    return (id) => {
      if (!id) return 'Unassigned';
      return map.get(id) ?? (members.loading ? '…' : 'Unknown member');
    };
  }, [members.data, members.loading]);

  const fetched = leads.data?.items ?? [];
  const rows = due
    ? fetched.filter((lead) => (due === 'none' ? isAdrift(lead) : followUpBucket(lead) === due))
    : fetched;
  const total = leads.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<Column<Lead>[]>(() => [
    { key: 'name', header: 'Lead', sortValue: (lead) => lead.name, render: (lead) => <div><Link className="table-link" to={`/leads/${lead.id}`}>{lead.name}</Link><p className="muted">{lead.email ?? lead.phone ?? 'No contact'}</p></div> },
    { key: 'source', header: 'Source', sortValue: (lead) => lead.source ?? '', render: (lead) => lead.source ? humanize(lead.source) : '—' },
    { key: 'status', header: 'Status', sortValue: (lead) => lead.status, render: (lead) => <StatusBadge value={lead.status} /> },
    { key: 'assigned', header: 'Assigned', sortValue: (lead) => assigneeName(lead.assignedToId), render: (lead) => assigneeName(lead.assignedToId) },
    { key: 'followUp', header: 'Next follow-up', sortValue: (lead) => lead.nextFollowUpAt ?? '', render: (lead) => <FollowUpCell lead={lead} /> },
    { key: 'created', header: 'Created', sortValue: (lead) => lead.createdAt ?? '', render: (lead) => formatDateTime(lead.createdAt) },
    { key: 'actions', header: '', className: 'cell-right', render: (lead) => <ButtonLink to={`/leads/${lead.id}`} variant="secondary" size="sm">Open</ButtonLink> },
  ], [assigneeName]);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Social enquiries and website forms, assigned and tracked through to close."
        action={
          <RoleGate permission="leads:manage" fallback={<Button size="sm" disabled>New lead</Button>}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>New lead</Button>
          </RoleGate>
        }
      />

      <div className="task-alerts task-alerts--4">
        <DueTile label="Overdue" value={followUp.overdue} tone="danger" active={due === 'overdue'} onClick={() => setDue(due === 'overdue' ? '' : 'overdue')} helper="Follow-up date has passed." loading={allLeads.loading} />
        <DueTile label="Due today" value={followUp.today} tone="warning" active={due === 'today'} onClick={() => setDue(due === 'today' ? '' : 'today')} helper="Contact them before the day ends." loading={allLeads.loading} />
        <DueTile label="This week" value={followUp.week} tone="info" active={due === 'week'} onClick={() => setDue(due === 'week' ? '' : 'week')} helper="Within the next seven days." loading={allLeads.loading} />
        <DueTile label="No follow-up set" value={followUp.none} tone="neutral" active={due === 'none'} onClick={() => setDue(due === 'none' ? '' : 'none')} helper="Open leads nobody has scheduled." loading={allLeads.loading} />
      </div>

      <div className="pipeline-summary card">
        {LEAD_PIPELINE.map((item) => (
          <button
            key={item}
            type="button"
            className="pipeline-summary__item"
            onClick={() => setStatusFilter(status === item ? '' : item)}
            aria-pressed={status === item}
          >
            <span>{humanize(item)}</span>
            <strong>{counts.loading ? '—' : counts.data?.[item] ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="toolbar card">
        <div className="toolbar__filters toolbar__filters--wide">
          <div className="field">
            <span className="field__label">Scope</span>
            <SegmentedControl<Scope>
              label="Lead scope"
              value={scope}
              onChange={setScope}
              options={[{ label: 'All leads', value: 'all' }, { label: 'My leads', value: 'mine' }]}
            />
          </div>
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
        <PipelineView
          loading={leads.loading}
          refreshing={leads.refreshing}
          error={leads.error}
          rows={rows}
          onRetry={leads.refetch}
          assigneeName={assigneeName}
          filtersActive={Boolean(status || source || search)}
          onClearFilters={() => setUrlFilters({ status: '', source: '', search: '' })}
          onCreate={() => setCreateOpen(true)}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(lead) => lead.id}
            loading={leads.loading}
            error={leads.error}
            onRetry={leads.refetch}
            emptyTitle={status || source || search ? 'No leads match these filters' : 'No leads yet'}
            emptyDescription={status || source || search ? undefined : 'Every enquiry from social, the website or a referral becomes a lead here, with a follow-up date so nothing goes cold.'}
            emptyAction={status || source || search
              ? <Button variant="secondary" size="sm" onClick={() => setUrlFilters({ status: '', source: '', search: '' })}>Clear filters</Button>
              : <RoleGate permission="leads:manage"><Button size="sm" onClick={() => setCreateOpen(true)}>Add the first lead</Button></RoleGate>}
            defaultSortKey="name"
          />
          {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onPageChange={setPage} /> : null}
          {total > 0 ? <p className="muted">Showing {rows.length} of {total} leads.</p> : null}
        </>
      )}

      <LeadModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} members={members.data ?? []} existing={allLeads.data ?? []} />
    </>
  );
}

/**
 * The board previously rendered with `items={[]}` while loading, so all seven
 * columns read "No leads here" before popping to real data, and an error
 * appeared *below* a board that was still showing empty columns.
 */
function PipelineView({
  loading,
  refreshing,
  error,
  rows,
  onRetry,
  assigneeName,
  page,
  totalPages,
  onPageChange,
  filtersActive,
  onClearFilters,
  onCreate,
}: {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  rows: Lead[];
  onRetry: () => void;
  assigneeName: AssigneeNameFn;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  if (loading) return <BoardSkeleton columns={LEAD_PIPELINE} />;
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>;

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title={filtersActive ? 'No leads match these filters' : 'No leads yet'}
          description={filtersActive ? 'Clear the search or choose a different stage.' : 'Every enquiry from social, the website or a referral becomes a lead here, with a follow-up date so nothing goes cold.'}
          action={filtersActive
            ? <Button variant="secondary" size="sm" onClick={onClearFilters}>Clear filters</Button>
            : <RoleGate permission="leads:manage"><Button size="sm" onClick={onCreate}>Add the first lead</Button></RoleGate>}
        />
      </Card>
    );
  }

  return (
    <section className="board-section" aria-label="Sales pipeline board">
      {refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
      <KanbanBoard
        columns={LEAD_PIPELINE}
        items={rows}
        renderCard={(lead) => <LeadBoardCard lead={lead} assigneeName={assigneeName(lead.assignedToId)} />}
        emptyText="No leads here."
      />
      {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} /> : null}
    </section>
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
      <ContactRow lead={lead} />
      <div className="kanban-card__footer">
        <FollowUpCell lead={lead} compact />
      </div>
    </Link>
  );
}

function LeadModal({ open, companyId, onClose, members, existing }: { open: boolean; companyId: string; onClose: () => void; members: Membership[]; existing: Lead[] }) {
  const { userId } = useTaskActor();
  const form = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    // A lead is born owned: whoever adds it follows it up, unless they say otherwise.
    defaultValues: { name: '', email: '', phone: '', source: LeadSource.INSTAGRAM, interestedService: '', notes: '', nextFollowUpAt: '', assignedToId: userId ?? '' },
    mode: 'onBlur',
  });

  // "Looks like Nour Clinic (Contacted, 3 days ago)" — before the second record exists.
  const watchedEmail = form.watch('email');
  const watchedPhone = form.watch('phone');
  const duplicate = useMemo(
    () => existing.find((lead) => looksLikeDuplicate({ email: watchedEmail, phone: watchedPhone }, lead)) ?? null,
    [existing, watchedEmail, watchedPhone],
  );

  const create = useMutation(leadsService.create, {
    // Prefix key: refreshes every filtered list AND the pipeline counts.
    invalidateKeys: [['companies', companyId, 'leads']],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  // Clear both the form and the mutation, otherwise a previous error is still
  // on screen the next time the modal opens.
  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  const submit = form.handleSubmit(async (values) => {
    const result = await create.mutate(companyId, {
      name: values.name.trim(),
      email: values.email || undefined,
      phone: values.phone,
      source: values.source,
      interestedService: values.interestedService,
      notes: values.notes,
      nextFollowUpAt: fromInputDateTime(values.nextFollowUpAt ?? ''),
      assignedToId: values.assignedToId || undefined,
      // no status — backend sets NEW
    });
    if (result) {
      toast.success('Lead created.');
      close();
    }
  });

  return (
    <Modal
      open={open}
      onClose={cancel}
      title="Create lead"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
          <Button type="submit" form="lead-form" loading={form.formState.isSubmitting || create.loading}>Create lead</Button>
        </>
      }
    >
      <form id="lead-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="lead-name" error={form.formState.errors.name?.message}>
          <Input id="lead-name" aria-invalid={Boolean(form.formState.errors.name)} {...form.register('name')} />
        </Field>
        <div className="grid-2">
          <Field label="Email" htmlFor="lead-email" error={form.formState.errors.email?.message}>
            <Input id="lead-email" type="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
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
        {duplicate ? (
          <div className="review-note review-note--inline" role="status">
            <div>
              <p className="review-note__title">Looks like an existing lead</p>
              <p>
                <Link className="table-link" to={`/leads/${duplicate.id}`}>{duplicate.name}</Link> has the same {duplicate.email && duplicate.email.toLowerCase() === (watchedEmail ?? '').trim().toLowerCase() ? 'email' : 'phone'} —
                {' '}{humanize(duplicate.status)}, updated {formatDateTime(duplicate.updatedAt ?? duplicate.createdAt)}. Open it instead of creating a second one.
              </p>
            </div>
          </div>
        ) : null}
        <Field label="Interested service" htmlFor="lead-service" hint="What the lead asked about.">
          <Input id="lead-service" {...form.register('interestedService')} />
        </Field>
        <Field label="Assigned to" htmlFor="lead-assignee" hint="Who follows this lead up. Defaults to you.">
          <Select
            id="lead-assignee"
            value={assigneeValueFor(members, form.watch('assignedToId'))}
            onChange={(event) => form.setValue('assignedToId', assigneeUserId(event.target.value), { shouldDirty: true })}
          >
            <AssigneeOptions members={members} />
          </Select>
        </Field>
        <Field label="Notes" htmlFor="lead-notes">
          <Textarea id="lead-notes" rows={3} {...form.register('notes')} />
        </Field>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}


/** One of the four follow-up tiles. Pressed = the list is filtered to it. */
function DueTile({ label, value, helper, tone, active, onClick, loading }: { label: string; value: number; helper: string; tone: 'danger' | 'warning' | 'info' | 'neutral'; active: boolean; onClick: () => void; loading: boolean }) {
  return (
    <button type="button" className={`task-alert card due-tile due-tile--${tone}${active ? ' due-tile--active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span>{label}</span>
      <strong>{loading ? '—' : value}</strong>
      <p>{helper}</p>
    </button>
  );
}

/** The follow-up date with its urgency: red when past, amber today, plain otherwise, and "not set" when adrift. */
function FollowUpCell({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const bucket = followUpBucket(lead);
  if (!isOpenLead(lead)) return <span className="muted">{compact ? 'Closed' : '—'}</span>;
  if (!lead.nextFollowUpAt) return <Badge tone="warning">No follow-up set</Badge>;
  if (bucket === 'overdue') {
    return (
      <span className="cell-stack">
        <span className="danger-text">{formatDateTime(lead.nextFollowUpAt)}</span>
        <span className="danger-text">overdue by {formatWaiting(lead.nextFollowUpAt)}</span>
      </span>
    );
  }
  return (
    <span className="cell-stack">
      <span>{formatDateTime(lead.nextFollowUpAt)}</span>
      {bucket === 'today' ? <Badge tone="warning">Today</Badge> : null}
    </span>
  );
}

/** Tap-to-contact on the card. Stops the click from opening the card. */
function ContactRow({ lead }: { lead: Lead }) {
  const links = contactLinks(lead);
  if (!links.email && !links.phone && !links.whatsapp) return null;
  const stop = (event: React.MouseEvent) => event.stopPropagation();
  return (
    <div className="contact-row" onClick={stop}>
      {links.whatsapp ? <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" onClick={stop}>WhatsApp</a> : null}
      {links.phone ? <a href={links.phone} onClick={stop}>Call</a> : null}
      {links.email ? <a href={links.email} onClick={stop}>Email</a> : null}
    </div>
  );
}
