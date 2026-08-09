import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireAdmin } from '@/components/layout/RequireAdmin';
import { PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { companiesService } from '@/services/companies';
import { queryKeys } from '@/lib/queryClient';
import type { Company } from '@/types/domain';
import { humanize } from '@/utils/format';

export function ClientsPage() {
  return (
    <RequireAdmin>
      <ClientsInner />
    </RequireAdmin>
  );
}

function ClientsInner() {
  const clients = useAsync(() => companiesService.list(), [], { queryKey: queryKeys.companies });
  const [createOpen, setCreateOpen] = useState(false);

  const columns = useMemo<Column<Company>[]>(() => [
    { key: 'name', header: 'Client', render: (client) => <strong>{client.name}</strong> },
    {
      key: 'status',
      header: 'Status',
      render: (client) => <Badge tone={client.status === 'ACTIVE' || !client.status ? 'success' : 'neutral'}>{humanize(client.status ?? 'ACTIVE')}</Badge>,
    },
    { key: 'industry', header: 'Industry', render: (client) => client.industry ?? '—' },
    { key: 'location', header: 'Location', render: (client) => [client.city, client.country].filter(Boolean).join(', ') || '—' },
  ], []);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Every client Solutions works with. Add a client here before assigning employees to it."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}>Add client</Button>}
      />

      <DataTable
        columns={columns}
        rows={clients.data ?? []}
        rowKey={(client) => client.id}
        loading={clients.loading}
        error={clients.error}
        onRetry={clients.refetch}
        emptyTitle="No clients yet"
        emptyDescription="Add the first client to start assigning employees to it."
      />

      <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Client name is required.'),
});

type CreateClientForm = z.infer<typeof createClientSchema>;

function CreateClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const form = useForm<CreateClientForm>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { name: '' },
    mode: 'onBlur',
  });

  const create = useMutation(companiesService.create, {
    invalidateKeys: [queryKeys.companies],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    const created = await create.mutate({ name: values.name.trim() });
    if (created) {
      toast.success('Client added.');
      close();
    }
  });

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add client"
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
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
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}
