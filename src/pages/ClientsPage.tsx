import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { ClientDetailPanel } from '@/components/admin/ClientDetailPanel';
import { DeleteClientDialog } from '@/components/admin/DeleteClientDialog';
import { RequireAdmin } from '@/components/layout/RequireAdmin';
import { PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useCompany } from '@/context/CompanyContext';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { companiesService } from '@/services/companies';
import type { Company } from '@/types/domain';
import { formatDate, humanize } from '@/utils/format';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

export function ClientsPage() {
  return (
    <RequireAdmin>
      <ClientsInner />
    </RequireAdmin>
  );
}

function ClientsInner() {
  const clients = useAsync(() => companiesService.list(), [], { queryKey: queryKeys.companies });
  const { refreshCompanies } = useCompany();
  const [createOpen, setCreateOpen] = useState(false);

  /*
    Panels track the client *id*, not the object. Renaming refetches the list,
    and a captured `Company` would go on showing the old name in the open
    panel — the one place the change most needs to be visible.
  */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const rows = clients.data ?? [];
  const byId = useMemo(() => new Map(rows.map((client) => [client.id, client])), [rows]);
  const detailClient = detailId ? byId.get(detailId) ?? null : null;
  const deleteClient = deleteId ? byId.get(deleteId) ?? null : null;

  const columns = useMemo<Column<Company>[]>(() => [
    {
      key: 'name',
      header: 'Client',
      sortValue: (client) => client.name,
      render: (client) => (
        <div>
          <strong>{client.name}</strong>
          {client.website ? <p className="muted">{client.website}</p> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (client) => client.status ?? 'ACTIVE',
      render: (client) => (
        <Badge tone={client.status === 'ARCHIVED' ? 'neutral' : client.status === 'INACTIVE' ? 'warning' : 'success'}>
          {humanize(client.status ?? 'ACTIVE')}
        </Badge>
      ),
    },
    { key: 'industry', header: 'Industry', render: (client) => client.industry ?? '—' },
    {
      key: 'location',
      header: 'Location',
      render: (client) => [client.city, client.country].filter(Boolean).join(', ') || '—',
    },
    {
      key: 'createdAt',
      header: 'Added',
      sortValue: (client) => client.createdAt ?? '',
      render: (client) => formatDate(client.createdAt),
    },
    {
      key: 'actions',
      header: '',
      className: 'cell-right',
      render: (client) => (
        <Button variant="secondary" size="sm" onClick={() => setDetailId(client.id)}>Manage</Button>
      ),
    },
  ], []);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Add a client, rename it, staff it and archive it. Both admin roles see every client."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}>Add client</Button>}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(client) => client.id}
        loading={clients.loading}
        error={clients.error}
        onRetry={clients.refetch}
        emptyTitle="No clients yet"
        emptyDescription="Add the first client to start assigning employees to it."
        pageSize={20}
        defaultSortKey="name"
      />

      <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <ClientDetailPanel
        client={detailClient}
        onClose={() => setDetailId(null)}
        onRequestDelete={(client) => {
          setDetailId(null);
          setDeleteId(client.id);
        }}
      />

      <DeleteClientDialog
        client={deleteClient}
        onClose={() => setDeleteId(null)}
        onDeleted={() => {
          setDeleteId(null);
          // Drops the client from the switcher and moves the active company
          // off it if that is where the user was.
          void refreshCompanies();
        }}
      />
    </>
  );
}

/**
 * `website` must carry a protocol — the API 400s on a bare domain. Rather than
 * bounce the user for it, a missing scheme is prefixed here before validation.
 */
const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Client name is required.').max(160, 'Client name is too long.'),
  industry: z.string().trim().max(120, 'Industry is too long.').optional(),
  website: z
    .string()
    .trim()
    .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
    .refine((value) => !value || /^https?:\/\/\S+\.\S+/i.test(value), 'Enter a valid website address.')
    .optional(),
  phone: z.string().trim().max(40, 'Phone number is too long.').optional(),
  city: z.string().trim().max(120, 'City is too long.').optional(),
  country: z.string().trim().max(120, 'Country is too long.').optional(),
});

type CreateClientForm = z.infer<typeof createClientSchema>;

/** Drops empty optional fields — an empty string is a validation error, not a "leave it blank". */
function withoutBlanks(values: CreateClientForm) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
  ) as CreateClientForm;
}

function CreateClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshCompanies } = useCompany();
  const form = useForm<CreateClientForm>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { name: '', industry: '', website: '', phone: '', city: '', country: '' },
    mode: 'onBlur',
  });

  const create = useMutation(companiesService.create, {
    invalidateKeys: [queryKeys.companies, ADMIN_DASHBOARD_KEY],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    const created = await create.mutate(withoutBlanks(values));
    if (created) {
      /*
        The creator is added as ACCOUNT_MANAGER server-side, so no follow-up
        member call is made here — that would be a duplicate-membership error.
        Staffing the client is the next step, in the Manage panel.
      */
      toast.success(`${created.name} added. Assign people to it from Manage.`);
      void refreshCompanies();
      close();
    }
  });

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  return (
    <Modal
      open={open}
      onClose={cancel}
      title="Add client"
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
          <Button form="create-client-form" type="submit" loading={form.formState.isSubmitting || create.loading}>
            Add client
          </Button>
        </>
      )}
    >
      <form id="create-client-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Client name" htmlFor="client-name" error={form.formState.errors.name?.message}>
          <Input
            id="client-name"
            autoFocus
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register('name')}
          />
        </Field>
        <div className="field-grid">
          <Field label="Industry" htmlFor="client-industry" error={form.formState.errors.industry?.message}>
            <Input id="client-industry" {...form.register('industry')} />
          </Field>
          <Field
            label="Website"
            htmlFor="client-website"
            hint="https:// is added for you if you leave it off."
            error={form.formState.errors.website?.message}
          >
            <Input id="client-website" inputMode="url" {...form.register('website')} />
          </Field>
          <Field label="Phone" htmlFor="client-phone" error={form.formState.errors.phone?.message}>
            <Input id="client-phone" inputMode="tel" {...form.register('phone')} />
          </Field>
          <Field label="City" htmlFor="client-city" error={form.formState.errors.city?.message}>
            <Input id="client-city" {...form.register('city')} />
          </Field>
          <Field label="Country" htmlFor="client-country" error={form.formState.errors.country?.message}>
            <Input id="client-country" {...form.register('country')} />
          </Field>
        </div>
        <p className="muted">Only the name is required. Everything else can be filled in later.</p>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}
