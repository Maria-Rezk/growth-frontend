import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { KanbanBoard } from '@/components/domain/KanbanBoard';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { contentService } from '@/services/content';
import { queryKeys } from '@/lib/queryClient';
import { fromInputDateTime, formatDateTime, humanize } from '@/utils/format';
import { POST_WORKFLOW, groupByStatus } from '@/utils/workflow';
import { PostStatus, type ContentPost } from '@/types/domain';

const STATUS_OPTIONS = Object.values(PostStatus);
type ViewMode = 'board' | 'table';

// Backend enums — values must match exactly; labels are display-only.
const PLATFORM_OPTIONS = [
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'WEBSITE', label: 'Website' },
] as const;

const CONTENT_TYPE_OPTIONS = [
  { value: 'POST', label: 'Post' },
  { value: 'REEL', label: 'Reel' },
  { value: 'STORY', label: 'Story' },
  { value: 'CAROUSEL', label: 'Carousel' },
  { value: 'VIDEO', label: 'Video' },
] as const;

const postSchema = z.object({
  title: z.string().trim().min(3, 'Post title is required.'),
  contentPlanId: z.string().optional(),
  platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'WHATSAPP', 'WEBSITE']),
  contentType: z.enum(['POST', 'REEL', 'STORY', 'CAROUSEL', 'VIDEO']),
  caption: z.string().optional(),
  visualBrief: z.string().optional(),
  scheduledAt: z.string().optional(),
});

type PostForm = z.infer<typeof postSchema>;

export function PostsPage() {
  return <RequireCompany>{(companyId) => <PostsInner companyId={companyId} />}</RequireCompany>;
}

function PostsInner({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [view, setView] = useState<ViewMode>('board');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = { status: status || undefined, search: debouncedSearch || undefined };
  const posts = useAsync(
    () => contentService.listPosts(companyId, filters),
    [companyId, status, debouncedSearch],
    { queryKey: queryKeys.posts(companyId, filters) },
  );
  const rows = posts.data ?? [];
  const grouped = groupByStatus(rows);

  const columns = useMemo<Column<ContentPost>[]>(() => [
    { key: 'title', header: 'Post', sortValue: (post) => post.title, render: (post) => <div><Link className="table-link" to={`/posts/${post.id}`}>{post.title}</Link><p className="muted">{post.platform ?? 'No platform'} · {post.contentType ?? 'Content'}</p></div> },
    { key: 'status', header: 'Status', sortValue: (post) => post.status, render: (post) => <StatusBadge value={post.status} /> },
    { key: 'date', header: 'Scheduled', sortValue: (post) => post.scheduledAt ?? '', render: (post) => formatDateTime(post.scheduledAt) },
    { key: 'created', header: 'Created', sortValue: (post) => post.createdAt ?? '', render: (post) => formatDateTime(post.createdAt) },
    { key: 'actions', header: '', className: 'cell-right', render: (post) => <ButtonLink to={`/posts/${post.id}`} variant="secondary" size="sm">Open</ButtonLink> },
  ], []);

  return (
    <>
      <PageHeader
        title="Content posts"
        subtitle="Draft, internal review, client approval, scheduling and publishing."
        action={
          <RoleGate permission="posts:create" fallback={<Button size="sm" disabled>New post</Button>}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>New post</Button>
          </RoleGate>
        }
      />

      <div className="workflow-summary card">
        {POST_WORKFLOW.map((step) => (
          <button key={step.status} type="button" className="workflow-summary__item" onClick={() => setStatus(status === step.status ? '' : step.status)} aria-pressed={status === step.status}>
            <span>{step.label}</span>
            <strong>{grouped[step.status]?.length ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="toolbar card">
        <div className="toolbar__filters">
          <Field label="Search" htmlFor="post-search">
            <Input id="post-search" placeholder="Search title or caption" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <Field label="Status" htmlFor="status-filter">
            <Select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </Select>
          </Field>
        </div>
        <SegmentedControl<ViewMode>
          label="Content view"
          value={view}
          onChange={setView}
          options={[{ label: 'Board', value: 'board' }, { label: 'Table', value: 'table' }]}
        />
      </div>

      {view === 'board' ? (
        <section className="board-section" aria-label="Approval and publishing board">
          <KanbanBoard
            columns={[PostStatus.DRAFT, PostStatus.IN_INTERNAL_REVIEW, PostStatus.READY_FOR_CLIENT, PostStatus.CHANGES_REQUESTED, PostStatus.APPROVED, PostStatus.SCHEDULED, PostStatus.PUBLISHED]}
            items={rows}
            renderCard={(post) => <PostBoardCard post={post} />}
            emptyText="No content here."
          />
          {posts.loading ? <p className="muted">Loading board…</p> : null}
          {posts.refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
          {posts.error ? <p className="error-box" role="alert">{posts.error}</p> : null}
        </section>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(post) => post.id} loading={posts.loading} error={posts.error} onRetry={posts.refetch} emptyTitle="No posts found" emptyDescription="Create a draft or apply an AI content plan." />
      )}

      <PostFormModal open={createOpen} companyId={companyId} onClose={() => setCreateOpen(false)} />
    </>
  );
}

function PostBoardCard({ post }: { post: ContentPost }) {
  return (
    <Link to={`/posts/${post.id}`} className="kanban-card">
      <div className="kanban-card__head">
        <strong>{post.title}</strong>
        <StatusBadge value={post.status} />
      </div>
      <p>{post.caption || post.visualBrief || 'No caption or visual brief added yet.'}</p>
      <div className="kanban-card__meta">
        <span>{post.platform ?? 'Platform missing'}</span>
        <span>{post.contentType ?? 'Content'}</span>
      </div>
      <div className="kanban-card__footer">
        <span>Scheduled</span>
        <strong>{formatDateTime(post.scheduledAt)}</strong>
      </div>
    </Link>
  );
}

function PostFormModal({ open, companyId, onClose }: { open: boolean; companyId: string; onClose: () => void }) {
  const create = useMutation(contentService.createPost, {
    // Prefix match: refreshes every filtered posts list + dependent views.
    invalidateKeys: [['companies', companyId, 'posts']],
  });
  // Content plans for the optional plan selector.
  const plans = useAsync(
    () => contentService.listPlans(companyId),
    [companyId],
    { queryKey: ['companies', companyId, 'content-plans'] },
  );
  const form = useForm<PostForm>({
    resolver: zodResolver(postSchema),
    defaultValues: { title: '', contentPlanId: '', caption: '', visualBrief: '', platform: 'INSTAGRAM', contentType: 'POST', scheduledAt: '' },
    mode: 'onBlur',
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await create.mutate(companyId, {
      title: values.title.trim(),
      contentPlanId: values.contentPlanId || undefined,
      caption: values.caption,
      visualBrief: values.visualBrief,
      platform: values.platform,
      contentType: values.contentType,
      scheduledAt: fromInputDateTime(values.scheduledAt ?? ''),
      // no status — the backend assigns the initial status and rejects it if sent
    });
    if (result) {
      toast.success('Draft post created.');
      form.reset();
      onClose();
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Create content draft" footer={<><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" form="post-form" loading={form.formState.isSubmitting || create.loading}>Create draft</Button></>}>
      <form id="post-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Title" htmlFor="post-title" error={form.formState.errors.title?.message}>
          <Input id="post-title" {...form.register('title')} />
        </Field>
        <Field label="Content plan" htmlFor="content-plan" hint="Optional. Attach this post to a monthly plan.">
          <Select id="content-plan" {...form.register('contentPlanId')}>
            <option value="">No plan</option>
            {(plans.data ?? []).map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
          </Select>
        </Field>
        <div className="grid-2">
          <Field label="Platform" htmlFor="platform" error={form.formState.errors.platform?.message}>
            <Select id="platform" {...form.register('platform')}>
              {PLATFORM_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
          </Field>
          <Field label="Content type" htmlFor="content-type" error={form.formState.errors.contentType?.message}>
            <Select id="content-type" {...form.register('contentType')}>
              {CONTENT_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Caption" htmlFor="caption" hint="Keep this editable. AI output should still pass through human review." error={form.formState.errors.caption?.message}>
          <Textarea id="caption" rows={5} {...form.register('caption')} />
        </Field>
        <Field label="Visual brief" htmlFor="visualBrief" error={form.formState.errors.visualBrief?.message}>
          <Textarea id="visualBrief" rows={4} {...form.register('visualBrief')} />
        </Field>
        <Field label="Schedule date" htmlFor="scheduledAt" error={form.formState.errors.scheduledAt?.message}>
          <Input id="scheduledAt" type="datetime-local" {...form.register('scheduledAt')} />
        </Field>
        {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
      </form>
    </Modal>
  );
}