import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Fields';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { CloseIcon, PlusIcon } from '@/components/ui/icons';
import { appRoutes } from '@/config/appRoutes';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { campaignsService } from '@/services/campaigns';
import { contentService } from '@/services/content';
import { leadsService } from '@/services/leads';
import { tasksService } from '@/services/tasks';
import { CampaignStatus, type ContentPost, type Lead, type Task } from '@/types/domain';
import { formatDate, formatDateTime, formatRatioPercent, humanize } from '@/utils/format';

/**
 * One campaign: what it is for, how it is doing, and the posts, leads and
 * tasks grouped under it.
 *
 * The list page linked here for months; the route did not exist. The
 * overview endpoint already returns the metrics, and the attach/detach
 * endpoints existed in the service with no screen calling them.
 *
 * Linked items are read from each record's `campaignId`. If the API does
 * not return that field on posts or leads yet, the counts (from the
 * overview) still show and the lists say so.
 */
export function CampaignDetailPage() {
  const { campaignId = '' } = useParams();
  return <RequireCompany>{(companyId) => <CampaignDetailInner companyId={companyId} campaignId={campaignId} />}</RequireCompany>;
}

const CAMPAIGN_STATUSES = Object.values(CampaignStatus);

function CampaignDetailInner({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const prefix = [['companies', companyId, 'campaigns']];
  const overview = useAsync(() => campaignsService.overview(companyId, campaignId), [companyId, campaignId], { queryKey: queryKeys.campaign(companyId, campaignId) });
  const posts = useAsync(() => contentService.listPosts(companyId), [companyId], { queryKey: queryKeys.posts(companyId) });
  const leads = useAsync(() => leadsService.list(companyId), [companyId], { queryKey: queryKeys.leads(companyId) });
  const tasks = useAsync(() => tasksService.list(companyId), [companyId], { queryKey: queryKeys.tasks(companyId) });

  const setStatus = useMutation(campaignsService.setStatus, { invalidateKeys: prefix });
  const confirm = useConfirm();

  if (overview.loading) return <DetailSkeleton />;
  if (overview.error || !overview.data) return <ErrorState message={overview.error ?? 'Campaign not found.'} onRetry={overview.refetch} />;

  const { campaign, metrics } = overview.data;
  const closed = campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.CANCELED;

  const changeStatus = async (status: CampaignStatus) => {
    if (status === campaign.status) return;
    if (status === CampaignStatus.CANCELED || status === CampaignStatus.COMPLETED) {
      const ok = await confirm({
        title: `Mark "${campaign.name}" as ${humanize(status).toLowerCase()}?`,
        message: 'Linked posts, leads and tasks keep their own status; only the campaign closes.',
        confirmLabel: humanize(status),
        tone: status === CampaignStatus.CANCELED ? 'danger' : 'primary',
      });
      if (!ok) return;
    }
    const result = await setStatus.mutate(companyId, campaignId, status);
    if (result) {
      overview.setData({ campaign: result, metrics });
      toast.success(`Campaign is now ${humanize(result.status).toLowerCase()}.`);
    }
  };

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={`${humanize(campaign.objective)} · ${formatDate(campaign.startDate)} – ${formatDate(campaign.endDate)}${campaign.budget ? ` · ${campaign.currency ?? ''} ${campaign.budget}` : ''}`}
        action={<ButtonLink to="/campaigns" variant="secondary" size="sm">All campaigns</ButtonLink>}
      />

      <div className="stat-grid stat-grid--3">
        <Tile label="Posts" value={metrics.posts.total} helper={`${metrics.posts.byStatus?.PUBLISHED ?? 0} published`} />
        <Tile label="Leads" value={metrics.leads.total} helper={`${metrics.leads.won} won · ${formatRatioPercent(metrics.leads.conversionRate)}`} />
        <Tile label="Tasks" value={metrics.tasks.total} helper={`${metrics.tasks.byStatus?.DONE ?? 0} done`} />
      </div>

      <div className="detail-grid">
        <section className="detail-main">
          <LinkedList<ContentPost>
            title="Posts"
            subtitle="Content produced for this campaign."
            state={posts}
            campaignId={campaignId}
            companyId={companyId}
            closed={closed}
            itemKey={(post) => post.id}
            label={(post) => post.title}
            meta={(post) => [post.platform, post.contentType].filter(Boolean).map((v) => humanize(v)).join(' · ')}
            status={(post) => post.status}
            to={(post) => appRoutes.post(post.id)}
            attach={(postId) => campaignsService.attachPost(companyId, campaignId, postId)}
            detach={(postId) => campaignsService.detachPost(companyId, campaignId, postId)}
            expected={metrics.posts.total}
            onChanged={() => { void posts.refetch(); void overview.refetch(); }}
          />
          <LinkedList<Lead>
            title="Leads"
            subtitle="Enquiries this campaign brought in."
            state={leads}
            campaignId={campaignId}
            companyId={companyId}
            closed={closed}
            itemKey={(lead) => lead.id}
            label={(lead) => lead.name}
            meta={(lead) => [lead.source ? humanize(lead.source) : null, lead.email ?? lead.phone].filter(Boolean).join(' · ')}
            status={(lead) => lead.status}
            to={(lead) => `/leads/${lead.id}`}
            attach={(leadId) => campaignsService.attachLead(companyId, campaignId, leadId)}
            detach={(leadId) => campaignsService.detachLead(companyId, campaignId, leadId)}
            expected={metrics.leads.total}
            onChanged={() => { void leads.refetch(); void overview.refetch(); }}
          />
          <LinkedList<Task>
            title="Tasks"
            subtitle="Work scheduled under this campaign."
            state={tasks}
            campaignId={campaignId}
            companyId={companyId}
            closed={closed}
            itemKey={(task) => task.id}
            label={(task) => task.title}
            meta={(task) => [humanize(task.type), task.dueDate ? `due ${formatDate(task.dueDate)}` : null].filter(Boolean).join(' · ')}
            status={(task) => task.status}
            to={(task) => appRoutes.task(task.id)}
            attach={(taskId) => campaignsService.attachTask(companyId, campaignId, taskId)}
            detach={(taskId) => campaignsService.detachTask(companyId, campaignId, taskId)}
            expected={metrics.tasks.total}
            onChanged={() => { void tasks.refetch(); void overview.refetch(); }}
          />
        </section>

        <aside className="detail-side">
          <Card>
            <CardHeader title="Status" action={<StatusBadge value={campaign.status} />} />
            <div className="content-card__body">
              <RoleGate permission="posts:create" fallback={<p className="muted">Your role cannot change campaign status.</p>}>
                <Field label="Set status" htmlFor="campaign-status">
                  <Select id="campaign-status" value={campaign.status} disabled={setStatus.loading} onChange={(event) => void changeStatus(event.target.value as CampaignStatus)}>
                    {CAMPAIGN_STATUSES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                  </Select>
                </Field>
                {setStatus.error ? <p className="error-box" role="alert">{setStatus.error}</p> : null}
              </RoleGate>
            </div>
          </Card>

          <Card>
            <CardHeader title="Brief" />
            <div className="content-card__body key-values">
              <div><span>Objective</span><strong>{humanize(campaign.objective)}</strong></div>
              <div><span>Runs</span><strong>{formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}</strong></div>
              <div><span>Budget</span><strong>{campaign.budget ? `${campaign.currency ?? ''} ${campaign.budget}` : '—'}</strong></div>
              <div><span>Audience</span><strong>{campaign.targetAudience || '—'}</strong></div>
              <div><span>Updated</span><strong>{formatDateTime(campaign.updatedAt)}</strong></div>
            </div>
            {campaign.description ? <div className="content-card__body"><p className="pre-wrap">{campaign.description}</p></div> : null}
            {campaign.notes ? <div className="content-card__body"><p className="pre-wrap muted">{campaign.notes}</p></div> : null}
          </Card>

          <MetricBreakdown title="Posts by status" counts={metrics.posts.byStatus} />
          <MetricBreakdown title="Leads by stage" counts={metrics.leads.byStatus} />
        </aside>
      </div>
    </>
  );
}

function Tile({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </Card>
  );
}

function MetricBreakdown({ title, counts }: { title: string; counts: Record<string, number> | undefined }) {
  const entries = Object.entries(counts ?? {}).filter(([, value]) => value > 0);
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader title={title} />
      <div className="content-card__body">
        {entries.map(([key, value]) => (
          <div className="list-row" key={key}><span>{humanize(key)}</span><strong>{value}</strong></div>
        ))}
      </div>
    </Card>
  );
}

type Linkable = { id: string; campaignId?: string | null };

/** One section of linked records, with attach and detach. Generic over post, lead, task. */
function LinkedList<T extends Linkable>({
  title,
  subtitle,
  state,
  campaignId,
  closed,
  itemKey,
  label,
  meta,
  status,
  to,
  attach,
  detach,
  expected,
  onChanged,
}: {
  title: string;
  subtitle: string;
  state: { data: T[] | null; loading: boolean; error: string | null; refetch: () => Promise<void> };
  campaignId: string;
  companyId: string;
  closed: boolean;
  itemKey: (item: T) => string;
  label: (item: T) => string;
  meta: (item: T) => string;
  status: (item: T) => string;
  to: (item: T) => string;
  attach: (id: string) => Promise<void>;
  detach: (id: string) => Promise<void>;
  /** The overview's count — shown when the list cannot see the link field. */
  expected: number;
  onChanged: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirm = useConfirm();

  // Plain filters, not memos: a few dozen rows, and a memo keyed on the
  // array would miss a campaignId that changed in place.
  const all = state.data ?? [];
  const linked = all.filter((item) => item.campaignId === campaignId);
  const available = all.filter((item) => item.campaignId !== campaignId);
  // The list endpoint does not carry campaignId on this backend yet: the
  // overview counts more than we can see. Say so instead of showing "none".
  const fieldMissing = linked.length === 0 && expected > 0;

  const doAttach = async () => {
    if (!choice) return;
    setBusyId(choice);
    try {
      await attach(choice);
      toast.success(`Added to the campaign.`);
      setChoice('');
      setPicking(false);
      onChanged();
    } catch (error) {
      toast.error((error as { message?: string })?.message ?? 'Could not attach.');
    } finally {
      setBusyId(null);
    }
  };

  const doDetach = async (item: T) => {
    const ok = await confirm({ title: `Remove "${label(item)}" from this campaign?`, message: 'The record itself is kept; only the link to the campaign is removed.', confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await detach(item.id);
      onChanged();
    } catch (error) {
      toast.error((error as { message?: string })?.message ?? 'Could not remove.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={`${title} (${linked.length || expected})`}
        subtitle={subtitle}
        action={!closed ? (
          <RoleGate permission="posts:create">
            <Button variant="secondary" size="sm" onClick={() => setPicking((v) => !v)}><PlusIcon size={14} /> Add</Button>
          </RoleGate>
        ) : undefined}
      />
      <div className="content-card__body stack-list">
        {picking ? (
          <div className="inline-form">
            <Select aria-label={`Choose a ${title.toLowerCase().replace(/s$/, '')} to add`} value={choice} onChange={(event) => setChoice(event.target.value)}>
              <option value="">Choose…</option>
              {available.map((item) => <option key={itemKey(item)} value={item.id}>{label(item)}</option>)}
            </Select>
            <Button size="sm" onClick={doAttach} disabled={!choice} loading={busyId === choice && choice !== ''}>Add</Button>
          </div>
        ) : null}
        {state.loading ? <p className="muted">Loading…</p> : null}
        {state.error ? <ErrorState message={state.error} onRetry={state.refetch} /> : null}
        {!state.loading && !state.error && linked.length === 0 ? (
          fieldMissing
            ? <p className="muted">{expected} linked, but this list cannot show which — the API does not return <code>campaignId</code> on these records yet.</p>
            : <EmptyState title={`No ${title.toLowerCase()} yet`} description={`Add one with the button above to track it under this campaign.`} />
        ) : null}
        {linked.map((item) => (
          <div className="list-row" key={itemKey(item)}>
            <div>
              <Link className="table-link" to={to(item)}>{label(item)}</Link>
              <p className="muted">{meta(item)}</p>
            </div>
            <span className="button-row">
              <StatusBadge value={status(item)} />
              {!closed ? (
                <RoleGate permission="posts:create">
                  <Button variant="ghost" size="sm" aria-label={`Remove ${label(item)}`} loading={busyId === item.id} onClick={() => doDetach(item)}><CloseIcon size={14} /></Button>
                </RoleGate>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

