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
import { RoleGate } from '@/components/domain/RoleGate';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { contentService } from '@/services/content';
import { formatDateTime } from '@/utils/format';
import type { ContentPlan } from '@/types/domain';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const now = new Date();

const planSchema = z.object({
  title: z.string().trim().min(3, 'Plan title is required.'),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  goal: z.string().trim().min(5, 'Describe the goal of this plan.'),
});
type PlanForm = z.infer<typeof planSchema>;

export function ContentPlansPage() {
  return <RequireCompany>{(companyId) => <ContentPlansInner companyId={companyId} />}</RequireCompany>;
}

function ContentPlansInner({ companyId }: { companyId: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const plans = useAsync(
    () => contentService.listPlans(companyId),
    [companyId],
    { queryKey: ['companies', companyId, 'content-plans'] },
  );
  const rows = plans.data ?? [];

  const columns = useMemo<Column<ContentPlan>[]>(() => [
    {
      key: 'title',
      header: 'Plan',
      sortValue: (plan) => plan.title,
      render: (plan) => {
        const goal = (plan as { goal?: string }).goal;
        return (
          <div>
            <strong>{plan.title}</strong>
            <p className="muted">
              {plan.month ? `${MONTHS[plan.month - 1]} ` : ''}{plan.year ?? ''}
              {goal ? ` · ${goal}` : ''}
            </p>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (plan) => (plan as { status?: string }).status ?? '',
      render: (plan) => {
        const status = (plan as { status?: string }).status;
        return status ? <span className="pill">{status.replace(/_/g, ' ')}</span> : <span className="muted">—</span>;
      },
    },
    { key: 'created', header: 'Created', sortValue: (plan) => plan.createdAt ?? '', render: (plan) => formatDateTime(plan.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'cell-right',
      render: () => <Link to="/posts"><Button variant="secondary" size="sm">View posts</Button></Link>,
    },
  ], []);

  return (
    <>
      <PageHeader
        title="Content plans"
        subtitle="Group posts into monthly plans. Generate a plan with AI, review it, then apply it into posts."
        action={
          <RoleGate permission="posts:create" fallback={<Button disabled>New plan</Button>}>
            <Button onClick={() => setCreateOpen(true)}>New plan</Button>
          </RoleGate>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(plan) => plan.id}
        loading={plans.loading}
        error={plans.error}
        onRetry={plans.refetch}
        emptyTitle="No content plans yet"
        emptyDescription="Create a plan manually or generate one in the AI studio."
      />

      <PlanFormModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} />
    </>
  );
}

function PlanFormModal({ open, companyId, onClose }: { open: boolean; companyId: string; onClose: () => void }) {
  const create = useMutation(contentService.createPlan, {
    invalidateKeys: [['companies', companyId, 'content-plans']],
  });
  const form = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    defaultValues: { title: '', month: now.getMonth() + 1, year: now.getFullYear(), goal: '' },
    mode: 'onBlur',
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await create.mutate(companyId, {
      title: values.title.trim(),
      month: values.month,
      year: values.year,
      goal: values.goal.trim(),
    });
    if (result) {
      toast.success('Content plan created.');
      form.reset();
      onClose();
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create content plan"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="plan-form" loading={form.formState.isSubmitting || create.loading}>Create plan</Button>
        </>
      }
    >
      <form id="plan-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Plan title" htmlFor="plan-title" error={form.formState.errors.title?.message}>
          <Input id="plan-title" {...form.register('title')} />
        </Field>
        <div className="grid-2">
          <Field label="Month" htmlFor="plan-month" error={form.formState.errors.month?.message}>
            <Select id="plan-month" {...form.register('month')}>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Year" htmlFor="plan-year" error={form.formState.errors.year?.message}>
            <Input id="plan-year" type="number" {...form.register('year')} />
          </Field>
        </div>
        <Field label="Goal" htmlFor="plan-goal" hint="What this month's content should achieve." error={form.formState.errors.goal?.message}>
          <Textarea id="plan-goal" rows={3} {...form.register('goal')} />
        </Field>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}