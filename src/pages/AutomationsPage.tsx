import { useState } from 'react';
import { Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import clsx from 'clsx';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { PlusIcon } from '@/components/ui/icons';
import { usePermission } from '@/hooks/usePermission';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { applyServerFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryClient';
import { AUTOMATION_TRIGGER_COPY, automationsService } from '@/services/automations';
import { AutomationTriggerType, type AutomationRule, type AutomationRun } from '@/types/domain';
import { formatDateTime, humanize } from '@/utils/format';

const ruleSchema = z.object({
  name: z.string().trim().min(3, 'Give the rule a name of at least 3 characters.').max(120),
  triggerType: z.nativeEnum(AutomationTriggerType),
});
type RuleForm = z.infer<typeof ruleSchema>;

type RunFilter = 'ALL' | 'FAILED' | 'SUCCESS';

export function AutomationsPage() {
  return <RequireCompany>{(companyId) => <AutomationsInner companyId={companyId} />}</RequireCompany>;
}

function AutomationsInner({ companyId }: { companyId: string }) {
  const allowed = usePermission('automations:manage');

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [runFilter, setRunFilter] = useState<RunFilter>('ALL');
  const [ruleFilter, setRuleFilter] = useState('');

  const rules = useAsync(() => automationsService.listRules(companyId), [companyId], { queryKey: queryKeys.automationRules(companyId), enabled: allowed });
  const runFilters = { status: runFilter === 'ALL' ? undefined : runFilter, ruleId: ruleFilter || undefined };
  const runs = useAsync(() => automationsService.listRuns(companyId, runFilters), [companyId, runFilter, ruleFilter], {
    queryKey: queryKeys.automationRuns(companyId, runFilters),
    enabled: allowed,
    keepPreviousData: true,
  });

  // Prefix: a toggle changes the rule list and, by name, the run history rows.
  const update = useMutation(automationsService.updateRule, { invalidateKeys: [['companies', companyId, 'automations']] });
  const [togglingId, setTogglingId] = useState<string | null>(null);

  if (!allowed) {
    return (
      <>
        <PageHeader title="Automations" subtitle="Rules that create work for you when something happens." />
        <EmptyState title="Account Managers only" description="Automation rules are managed by the client's Account Manager. Ask them if a rule should change." />
      </>
    );
  }

  const ruleList = rules.data ?? [];
  const runList = runs.data ?? [];
  const activeCount = ruleList.filter((rule) => rule.isActive).length;
  const failedShown = runList.filter((run) => run.status === 'FAILED').length;

  const toggle = async (rule: AutomationRule) => {
    setTogglingId(rule.id);
    try {
      const result = await update.mutate(companyId, rule.id, { isActive: !rule.isActive });
      if (result) toast.success(result.isActive ? `“${rule.name}” is on.` : `“${rule.name}” is paused.`);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Automations"
        subtitle="When something happens on this client, create the follow-up work automatically."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><PlusIcon size={14} /> New rule</Button>}
      />

      <div className="stat-grid stat-grid--3">
        <Card className="metric-card"><span>Rules</span><strong>{ruleList.length}</strong><p>{activeCount} on, {ruleList.length - activeCount} paused</p></Card>
        <Card className="metric-card"><span>Recent runs</span><strong>{runList.length}</strong><p>{runFilter === 'ALL' ? 'Latest firings of any rule.' : `Showing ${humanize(runFilter).toLowerCase()} only.`}</p></Card>
        <Card className="metric-card"><span>Failed</span><strong>{failedShown}</strong><p>{failedShown ? 'Open a row to see why.' : 'Nothing to fix.'}</p></Card>
      </div>

      <Card className="content-card">
        <CardHeader title="Rules" subtitle="Each rule watches for one trigger and does one thing. Pause a rule to stop it without losing it." />
        <div className="content-card__body">
          {rules.loading ? <ListSkeleton rows={2} /> : null}
          {rules.error ? <ErrorState message={rules.error} onRetry={rules.refetch} /> : null}
          {rules.data && ruleList.length === 0 ? (
            <EmptyState
              title="No automation rules yet"
              description="Start with “client asks for changes”: it creates the copy and design fix-up tasks the moment the request lands."
              action={<Button size="sm" onClick={() => setCreateOpen(true)}>Create the first rule</Button>}
            />
          ) : null}
          {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
          {ruleList.length ? (
            <ul className="rule-list">
              {ruleList.map((rule) => {
                const copy = AUTOMATION_TRIGGER_COPY[rule.triggerType];
                return (
                  <li key={rule.id} className={clsx('rule', !rule.isActive && 'rule--paused')}>
                    <div className="rule__main">
                      <p className="rule__name">{rule.name}</p>
                      <p className="rule__sentence">
                        <span className="rule__tag">When</span> {copy?.when ?? humanize(rule.triggerType)}
                        <span className="rule__tag">then</span> {copy?.then ?? humanize(rule.actionType)}
                      </p>
                    </div>
                    <div className="rule__controls">
                      <Badge tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'On' : 'Paused'}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(rule)}>Rename</Button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.isActive}
                        aria-label={`${rule.name}: ${rule.isActive ? 'on' : 'paused'}`}
                        className="switch"
                        disabled={togglingId === rule.id}
                        onClick={() => void toggle(rule)}
                      >
                        <span className="switch__thumb" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </Card>

      <Card className="content-card">
        <CardHeader
          title="Run history"
          subtitle="What fired, on which record, and whether it worked."
          action={(
            <span className="button-row">
              <SegmentedControl<RunFilter>
                label="Filter runs by result"
                value={runFilter}
                onChange={setRunFilter}
                options={[{ label: 'All', value: 'ALL' }, { label: 'Failed', value: 'FAILED' }, { label: 'Succeeded', value: 'SUCCESS' }]}
              />
              {ruleList.length > 1 ? (
                <Select aria-label="Filter runs by rule" value={ruleFilter} onChange={(event) => setRuleFilter(event.target.value)}>
                  <option value="">All rules</option>
                  {ruleList.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
                </Select>
              ) : null}
            </span>
          )}
        />
        <div className="content-card__body">
          {runs.loading ? <ListSkeleton rows={4} /> : null}
          {runs.error ? <ErrorState message={runs.error} onRetry={runs.refetch} /> : null}
          {runs.data && runList.length === 0 ? (
            <EmptyState
              title={runFilter === 'ALL' && !ruleFilter ? 'Nothing has fired yet' : 'No runs match'}
              description={runFilter === 'ALL' && !ruleFilter ? 'Runs appear here as soon as a rule’s trigger happens.' : 'Try another result or rule.'}
            />
          ) : null}
          {runList.length ? <ul className="run-list">{runList.map((run) => <RunRow key={run.id} run={run} />)}</ul> : null}
        </div>
      </Card>

      <RuleModal key="create" open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} />
      {editing ? <RuleModal key={editing.id} open companyId={companyId} rule={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

/** Where a run's record lives in the app, when we can link to it. */
function recordLink(run: AutomationRun): string | null {
  if (!run.entityId) return null;
  const type = run.entityType?.toUpperCase();
  if (type === 'POST') return `/posts/${run.entityId}`;
  if (type === 'LEAD') return `/leads/${run.entityId}`;
  if (type === 'TASK') return `/tasks/${run.entityId}`;
  return null;
}

function RunRow({ run }: { run: AutomationRun }) {
  const failed = run.status === 'FAILED';
  const link = recordLink(run);
  const trigger = run.triggerType ? AUTOMATION_TRIGGER_COPY[run.triggerType as AutomationTriggerType]?.when ?? humanize(run.triggerType) : null;
  return (
    <li className={clsx('run', failed && 'run--failed')}>
      <div className="run__head">
        <Badge tone={failed ? 'danger' : run.status === 'SUCCESS' ? 'success' : 'neutral'}>{failed ? 'Failed' : run.status === 'SUCCESS' ? 'Succeeded' : humanize(run.status)}</Badge>
        <strong>{run.ruleName ?? 'Rule'}</strong>
        {run.createdAt ? <time dateTime={run.createdAt}>{formatDateTime(run.createdAt)}</time> : null}
      </div>
      <p className="muted">
        {[trigger, run.entityType ? humanize(run.entityType) : null].filter(Boolean).join(' · ')}
        {link ? <>{' · '}<Link className="table-link" to={link}>Open {run.entityType?.toLowerCase()}</Link></> : null}
      </p>
      {/* The error string is the only clue for a broken rule — verbatim, like the dashboard card. */}
      {failed && run.error ? <p className="run__error">{run.error}</p> : null}
    </li>
  );
}

function RuleModal({ open, companyId, rule, onClose }: { open: boolean; companyId: string; rule?: AutomationRule; onClose: () => void }) {
  const editing = Boolean(rule);
  const form = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { name: rule?.name ?? '', triggerType: rule?.triggerType ?? AutomationTriggerType.POST_CHANGES_REQUESTED },
    mode: 'onBlur',
  });
  const invalidateKeys = [['companies', companyId, 'automations']] as const;
  const onError = (error: unknown) => applyServerFieldErrors(form, error);
  const createRule = useMutation(automationsService.createRule, { invalidateKeys, onError });
  const updateRule = useMutation(automationsService.updateRule, { invalidateKeys, onError });
  const active = editing ? updateRule : createRule;

  const close = () => {
    form.reset();
    createRule.reset();
    updateRule.reset();
    onClose();
  };
  const cancel = useDiscardGuard(form, open)(close);

  const trigger = form.watch('triggerType');

  const submit = form.handleSubmit(async (values) => {
    const result = rule
      ? await updateRule.mutate(companyId, rule.id, { name: values.name.trim() })
      : await createRule.mutate(companyId, { name: values.name.trim(), triggerType: values.triggerType });
    if (result) {
      toast.success(editing ? 'Rule renamed.' : 'Rule created and switched on.');
      close();
    }
  });

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={editing ? 'Rename rule' : 'New automation rule'}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
          <Button type="submit" form="rule-form" loading={form.formState.isSubmitting || active.loading}>{editing ? 'Save name' : 'Create rule'}</Button>
        </>
      )}
    >
      <form id="rule-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="rule-name" error={form.formState.errors.name?.message}>
          <Input id="rule-name" placeholder="e.g. Fix-ups when the client asks for changes" {...form.register('name')} />
        </Field>
        {/* The trigger decides the action and cannot change once the rule exists. */}
        <Field
          label="When this happens"
          htmlFor="rule-trigger"
          hint={editing ? 'A rule’s trigger is fixed. Create a new rule to react to something else.' : undefined}
          error={form.formState.errors.triggerType?.message}
        >
          <Select id="rule-trigger" disabled={editing} {...form.register('triggerType')}>
            {Object.values(AutomationTriggerType).map((type) => <option key={type} value={type}>{AUTOMATION_TRIGGER_COPY[type].when}</option>)}
          </Select>
        </Field>
        <div className="rule-preview" aria-live="polite">
          <span className="rule__tag">then</span> {AUTOMATION_TRIGGER_COPY[(rule?.triggerType ?? trigger)].then}
        </div>
        {active.error ? <p className="error-box" role="alert">{active.error}</p> : null}
      </form>
    </Modal>
  );
}
