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
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { applyServerFieldErrors } from '@/lib/forms';
import { campaignsService } from '@/services/campaigns';
import { queryKeys } from '@/lib/queryClient';
import { formatDate, humanize } from '@/utils/format';
import { fromInputDateTime } from '@/utils/format';
import { CampaignObjective, CampaignStatus, type Campaign } from '@/types/domain';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

const campaignSchema = z.object({
  name: z.string().trim().min(3, 'Campaign name is required.'),
  objective: z.nativeEnum(CampaignObjective),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.string().optional(),
  currency: z.string().optional(),
  targetAudience: z.string().optional(),
  notes: z.string().optional(),
});

type CampaignForm = z.infer<typeof campaignSchema>;

function formatBudget(budget?: string, currency?: string): string {
  if (!budget) return '—';
  const value = Number(budget);
  if (Number.isNaN(value)) return budget;
  return `${currency ? `${currency} ` : ''}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CampaignsPage() {
  return <RequireCompany>{(companyId) => <CampaignsInner companyId={companyId} />}</RequireCompany>;
}

function CampaignsInner({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);

  const filters = { status: status || undefined, search: debouncedSearch || undefined };
  const campaigns = useAsync(
    () => campaignsService.list(companyId, filters),
    [companyId, status, debouncedSearch],
    { queryKey: queryKeys.campaigns(companyId, filters) },
  );
  const setStatusMutation = useMutation(campaignsService.setStatus, {
    // Prefix, not the exact filtered key — otherwise changing a status only
    // refreshed the list you happened to be looking at.
    invalidateKeys: [['companies', companyId, 'campaigns']],
  });

  // Which row is mid-update. A shared boolean disabled every select at once.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const changeStatus = async (campaignId: string, next: Campaign['status']) => {
    setPendingId(campaignId);
    try {
      const result = await setStatusMutation.mutate(companyId, campaignId, next);
      if (result) toast.success('Campaign status updated.');
    } finally {
      setPendingId(null);
    }
  };

  const rows = campaigns.data ?? [];

  const columns = useMemo<Column<Campaign>[]>(() => [
    {
      key: 'name',
      header: 'Campaign',
      sortValue: (c) => c.name,
      render: (c) => <div><Link className="table-link" to={`/campaigns/${c.id}`}>{c.name}</Link><p className="muted">{humanize(c.objective)}</p></div>,
    },
    { key: 'status', header: 'Status', sortValue: (c) => c.status, render: (c) => <StatusBadge value={c.status} /> },
    { key: 'budget', header: 'Budget', sortValue: (c) => Number(c.budget ?? 0), render: (c) => formatBudget(c.budget, c.currency) },
    { key: 'dates', header: 'Dates', render: (c) => `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
    {
      key: 'setStatus',
      header: 'Set status',
      render: (c) => (
        <Select
          aria-label={`Change status for ${c.name}`}
          value={c.status}
          disabled={pendingId === c.id}
          onChange={(event) => changeStatus(c.id, event.target.value as Campaign['status'])}
        >
          {Object.values(CampaignStatus).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </Select>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [pendingId]);

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Plan and track marketing campaigns across posts, leads and tasks."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}>New campaign</Button>}
      />

      <div className="toolbar card">
        <div className="toolbar__filters toolbar__filters--wide">
          <Field label="Search" htmlFor="campaign-search">
            <Input id="campaign-search" placeholder="Search campaign name" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <Field label="Status" htmlFor="campaign-status-filter">
            <Select id="campaign-status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {Object.values(CampaignStatus).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      {setStatusMutation.error ? <p className="error-box" role="alert">{setStatusMutation.error}</p> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={campaigns.loading}
        error={campaigns.error}
        onRetry={campaigns.refetch}
        emptyTitle="No campaigns yet"
        defaultSortKey="name"
      />

      <CampaignModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} />
    </>
  );
}

function CampaignModal({ open, companyId, onClose }: { open: boolean; companyId: string; onClose: () => void }) {
  const form = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: '', objective: CampaignObjective.LEADS, description: '', startDate: '', endDate: '', budget: '', currency: 'USD', targetAudience: '', notes: '' },
    mode: 'onBlur',
  });

  const create = useMutation(campaignsService.create, {
    // Prefix: a new campaign must appear under any active filter combination.
    invalidateKeys: [['companies', companyId, 'campaigns']],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  const submit = form.handleSubmit(async (values) => {
    const budgetNumber = values.budget?.trim() ? Number(values.budget) : undefined;
    if (budgetNumber != null && Number.isNaN(budgetNumber)) {
      form.setError('budget', { message: 'Budget must be a number.' });
      return;
    }
    const result = await create.mutate(companyId, {
      name: values.name.trim(),
      objective: values.objective,
      description: values.description?.trim() || undefined,
      startDate: fromInputDateTime(values.startDate ?? ''),
      endDate: fromInputDateTime(values.endDate ?? ''),
      budget: budgetNumber,
      currency: values.currency?.trim() || undefined,
      targetAudience: values.targetAudience?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
    });
    if (result) {
      toast.success('Campaign created.');
      close();
    } else if (create.error) {
      toast.error(create.error);
    }
  });

  return (
    <Modal
      open={open}
      onClose={cancel}
      title="Create campaign"
      footer={<><Button variant="secondary" type="button" onClick={cancel}>Cancel</Button><Button type="submit" form="campaign-form" loading={form.formState.isSubmitting || create.loading}>Create campaign</Button></>}
    >
      <form id="campaign-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="campaign-name" error={form.formState.errors.name?.message}>
          <Input id="campaign-name" {...form.register('name')} />
        </Field>
        <div className="grid-2">
          <Field label="Objective" htmlFor="campaign-objective" error={form.formState.errors.objective?.message}>
            <Select id="campaign-objective" {...form.register('objective')}>
              {Object.values(CampaignObjective).map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="campaign-currency">
            <Input id="campaign-currency" {...form.register('currency')} />
          </Field>
        </div>
        <Field label="Description" htmlFor="campaign-description">
          <Textarea id="campaign-description" rows={3} {...form.register('description')} />
        </Field>
        <div className="grid-2">
          <Field label="Start date" htmlFor="campaign-start">
            <Input id="campaign-start" type="datetime-local" {...form.register('startDate')} />
          </Field>
          <Field label="End date" htmlFor="campaign-end">
            <Input id="campaign-end" type="datetime-local" {...form.register('endDate')} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Budget" htmlFor="campaign-budget" hint="Numbers only, e.g. 750" error={form.formState.errors.budget?.message}>
            <Input id="campaign-budget" inputMode="decimal" {...form.register('budget')} />
          </Field>
          <Field label="Target audience" htmlFor="campaign-audience">
            <Input id="campaign-audience" {...form.register('targetAudience')} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="campaign-notes">
          <Textarea id="campaign-notes" rows={2} {...form.register('notes')} />
        </Field>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}