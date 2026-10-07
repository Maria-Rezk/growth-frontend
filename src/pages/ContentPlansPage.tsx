import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { RoleGate } from '@/components/domain/RoleGate';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryClient';
import { contentService } from '@/services/content';
import { formatDateTime } from '@/utils/format';
import type { ContentPlan } from '@/types/domain';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const now = new Date();

const planSchema = z.object({
  title: z.string().trim().min(3, 'Plan title is required.'),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  goal: z.string().trim().min(5, 'Describe the goal of this plan.'),
});
// A plan generated elsewhere may have no goal; that must not stop it being renamed.
const editPlanSchema = planSchema.extend({ goal: z.string().trim() });
type PlanForm = z.infer<typeof planSchema>;

export function ContentPlansPage() {
  return <RequireCompany>{(companyId) => <ContentPlansInner companyId={companyId} />}</RequireCompany>;
}

function ContentPlansInner({ companyId }: { companyId: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const plans = useAsync(
    () => contentService.listPlans(companyId),
    [companyId],
    { queryKey: queryKeys.contentPlans(companyId) },
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
            <Link className="table-link" to={`/content-plans/${plan.id}`}>{plan.title}</Link>
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
      render: (plan) => <ButtonLink to={`/content-plans/${plan.id}`} variant="secondary" size="sm">Open</ButtonLink>,
    },
  ], []);

  return (
    <>
      <PageHeader
        title="Content plans"
        subtitle="Group posts into monthly plans. Generate with AI, review, then apply into posts."
        action={
          <RoleGate permission="plans:manage" fallback={<Button size="sm" disabled>New plan</Button>}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>New plan</Button>
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
        emptyAction={<RoleGate permission="plans:manage"><span className="button-row"><Button size="sm" onClick={() => setCreateOpen(true)}>Create the first plan</Button><ButtonLink to="/ai-studio" variant="secondary" size="sm">Generate with AI</ButtonLink></span></RoleGate>}
        emptyTitle="No content plans yet"
        defaultSortKey="title"
        emptyDescription="Create a plan manually or generate one in the AI studio."
      />

      <PlanFormModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} />
    </>
  );
}

/** Creates a plan, or edits `plan` when given. Mount it with a `key` so an edit starts from that plan's values. */
export function PlanFormModal({ open, companyId, onClose, plan }: { open: boolean; companyId: string; onClose: () => void; plan?: ContentPlan }) {
  const editing = Boolean(plan);
  const form = useForm<PlanForm>({
    resolver: zodResolver(editing ? editPlanSchema : planSchema),
    defaultValues: plan
      ? { title: plan.title, month: plan.month ?? now.getMonth() + 1, year: plan.year ?? now.getFullYear(), goal: plan.goal ?? '' }
      : { title: '', month: now.getMonth() + 1, year: now.getFullYear(), goal: '' },
    mode: 'onBlur',
  });

  const onError = (error: unknown) => applyServerFieldErrors(form, error);
  const createMutation = useMutation(contentService.createPlan, { invalidateKeys: [queryKeys.contentPlans(companyId)], onError });
  const updateMutation = useMutation(contentService.updatePlan, { invalidateKeys: [queryKeys.contentPlans(companyId)], onError });
  const create = editing ? updateMutation : createMutation;

  // Reset the mutation too, or a previous error is still shown on reopen.
  const close = () => {
    form.reset();
    createMutation.reset();
    updateMutation.reset();
    onClose();
  };
  const discard = useDiscardGuard(form, open);
  const cancel = discard(close);

  const submit = form.handleSubmit(async (values) => {
    const payload = { title: values.title.trim(), month: values.month, year: values.year, goal: values.goal.trim() };
    const result = plan
      ? await updateMutation.mutate(companyId, plan.id, payload)
      : await createMutation.mutate(companyId, payload);
    if (result) {
      toast.success(editing ? 'Content plan updated.' : 'Content plan created.');
      close();
    }
  });

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={editing ? 'Edit content plan' : 'Create content plan'}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
          <Button type="submit" form="plan-form" loading={form.formState.isSubmitting || create.loading}>{editing ? 'Save changes' : 'Create plan'}</Button>
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