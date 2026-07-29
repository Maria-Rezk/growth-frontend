import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useCompany } from '@/context/CompanyContext';
import { aiService, AiGenerationType, type AiGeneration } from '@/services/ai';
import { contentService } from '@/services/content';
import { queryKeys } from '@/lib/queryClient';
import { CompanyMembershipRole } from '@/types/domain';
import { formatDateTime, humanize } from '@/utils/format';

const GENERATOR_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
];

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'WHATSAPP', 'WEBSITE'];
const CONTENT_TYPES = ['POST', 'REEL', 'STORY', 'CAROUSEL', 'VIDEO'];

/**
 * Every conditional requirement lives here rather than in the submit handler.
 * Previously `goal` was enforced by a refine and `postId` by a toast, so half
 * the rules marked the field and half fired a disappearing message.
 */
const generateSchema = z
  .object({
    type: z.nativeEnum(AiGenerationType),
    goal: z.string().trim().optional(),
    language: z.enum(['ar', 'en']),
    // content plan
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2020).max(2100).optional(),
    numberOfPosts: z.coerce.number().int().min(1).max(30).optional(),
    // post ideas
    count: z.coerce.number().int().min(1).max(20).optional(),
    platform: z.string().optional(),
    contentType: z.string().optional(),
    // caption
    postId: z.string().trim().optional(),
    numberOfOptions: z.coerce.number().int().min(1).max(10).optional(),
    toneOverride: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.type === AiGenerationType.CAPTION_SUGGESTION) {
      if (!values.postId?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['postId'], message: 'Choose the post to caption.' });
      }
      return;
    }
    if ((values.goal?.trim().length ?? 0) < 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['goal'], message: 'Goal is required (at least 5 characters).' });
    }
  });

type GenerateForm = z.infer<typeof generateSchema>;

export function AiStudioPage() {
  return <RequireCompany>{(companyId) => <AiStudioInner companyId={companyId} />}</RequireCompany>;
}

function AiStudioInner({ companyId }: { companyId: string }) {
  const { hasRole } = useCompany();
  const canGenerate = hasRole(...GENERATOR_ROLES);

  const generations = useAsync(
    () => aiService.listGenerations(companyId),
    [companyId],
    { queryKey: ['companies', companyId, 'ai-generations'] },
  );

  // Shares PostsPage's cache key, so opening AI studio after Posts is free.
  const posts = useAsync(
    () => contentService.listPosts(companyId),
    [companyId],
    { queryKey: queryKeys.posts(companyId, {}) },
  );

  const invalidate = [['companies', companyId, 'ai-generations']];
  const genPlan = useMutation(aiService.generateContentPlanPreview, { invalidateKeys: invalidate });
  const genIdeas = useMutation(aiService.generatePostIdeas, { invalidateKeys: invalidate });
  const genCaption = useMutation(aiService.generateCaption, { invalidateKeys: invalidate });

  // Computed at mount, not module load — a tab left open overnight would
  // otherwise keep proposing yesterday's month.
  const [now] = useState(() => new Date());

  const form = useForm<GenerateForm>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      type: AiGenerationType.CONTENT_PLAN_PREVIEW,
      goal: '',
      language: 'ar',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      numberOfPosts: 8,
      count: 6,
      platform: 'INSTAGRAM',
      contentType: 'CAROUSEL',
      postId: '',
      numberOfOptions: 3,
      toneOverride: '',
    },
    mode: 'onBlur',
  });

  const type = form.watch('type');
  const busy = genPlan.loading || genIdeas.loading || genCaption.loading;
  const generateError = genPlan.error || genIdeas.error || genCaption.error;

  const submit = form.handleSubmit(async (v) => {
    let result: AiGeneration | null = null;

    if (v.type === AiGenerationType.CONTENT_PLAN_PREVIEW) {
      result = await genPlan.mutate(companyId, {
        month: v.month ?? now.getMonth() + 1,
        year: v.year ?? now.getFullYear(),
        goal: v.goal ?? '',
        numberOfPosts: v.numberOfPosts,
        language: v.language,
        platforms: v.platform ? [v.platform] : undefined,
      });
    } else if (v.type === AiGenerationType.POST_IDEAS) {
      result = await genIdeas.mutate(companyId, {
        goal: v.goal ?? '',
        count: v.count,
        language: v.language,
        platform: v.platform,
        contentType: v.contentType,
      });
    } else {
      // postId presence is guaranteed by the schema at this point.
      result = await genCaption.mutate(companyId, {
        postId: (v.postId ?? '').trim(),
        language: v.language,
        numberOfOptions: v.numberOfOptions,
        toneOverride: v.toneOverride || undefined,
      });
    }

    if (result) toast.success('AI draft generated. Review it before applying.');
  });

  const postOptions = posts.data ?? [];

  return (
    <>
      <PageHeader
        title="AI studio"
        subtitle="The model drafts, a human reviews, the system applies. Nothing reaches a client unreviewed."
      />

      <Card>
        <CardHeader title="New draft" subtitle="Choose the output type and give clear brand-specific direction." />
        <form className="form-grid form-card" onSubmit={submit} noValidate>
          <div className="grid-2">
            <Field label="Output type" htmlFor="ai-type">
              <Select id="ai-type" {...form.register('type')}>
                {Object.values(AiGenerationType).map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </Select>
            </Field>
            <Field label="Language" htmlFor="ai-language">
              <Select id="ai-language" {...form.register('language')}>
                <option value="ar">Arabic</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>

          {type !== AiGenerationType.CAPTION_SUGGESTION ? (
            <Field
              label="Goal"
              htmlFor="ai-goal"
              hint="What this content should achieve."
              error={form.formState.errors.goal?.message}
            >
              <Textarea id="ai-goal" rows={3} aria-invalid={Boolean(form.formState.errors.goal)} {...form.register('goal')} />
            </Field>
          ) : null}

          {type === AiGenerationType.CONTENT_PLAN_PREVIEW ? (
            <div className="field-grid">
              <Field label="Month" htmlFor="ai-month" error={form.formState.errors.month?.message}>
                <Input id="ai-month" type="number" min={1} max={12} {...form.register('month')} />
              </Field>
              <Field label="Year" htmlFor="ai-year" error={form.formState.errors.year?.message}>
                <Input id="ai-year" type="number" min={2020} max={2100} {...form.register('year')} />
              </Field>
              <Field label="Number of posts" htmlFor="ai-nposts" error={form.formState.errors.numberOfPosts?.message}>
                <Input id="ai-nposts" type="number" min={1} max={30} {...form.register('numberOfPosts')} />
              </Field>
              <Field label="Platform" htmlFor="ai-plat">
                <Select id="ai-plat" {...form.register('platform')}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
                </Select>
              </Field>
            </div>
          ) : null}

          {type === AiGenerationType.POST_IDEAS ? (
            <div className="field-grid">
              <Field label="Count" htmlFor="ai-count" error={form.formState.errors.count?.message}>
                <Input id="ai-count" type="number" min={1} max={20} {...form.register('count')} />
              </Field>
              <Field label="Platform" htmlFor="ai-plat2">
                <Select id="ai-plat2" {...form.register('platform')}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
                </Select>
              </Field>
              <Field label="Content type" htmlFor="ai-ctype">
                <Select id="ai-ctype" {...form.register('contentType')}>
                  {CONTENT_TYPES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                </Select>
              </Field>
            </div>
          ) : null}

          {type === AiGenerationType.CAPTION_SUGGESTION ? (
            <div className="field-grid">
              <Field
                label="Target post"
                htmlFor="ai-post"
                hint={posts.error ? 'Could not load posts.' : 'The caption is written for this post.'}
                error={form.formState.errors.postId?.message}
              >
                <Select
                  id="ai-post"
                  disabled={posts.loading || postOptions.length === 0}
                  aria-invalid={Boolean(form.formState.errors.postId)}
                  {...form.register('postId')}
                >
                  <option value="">
                    {posts.loading
                      ? 'Loading posts…'
                      : postOptions.length === 0
                        ? 'No posts yet — create one first'
                        : 'Select a post'}
                  </option>
                  {postOptions.map((post) => (
                    <option key={post.id} value={post.id}>
                      {post.title}{post.platform ? ` · ${humanize(post.platform)}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Number of options" htmlFor="ai-nopt" error={form.formState.errors.numberOfOptions?.message}>
                <Input id="ai-nopt" type="number" min={1} max={10} {...form.register('numberOfOptions')} />
              </Field>
              <Field label="Tone override" htmlFor="ai-tone" hint="Optional.">
                <Input id="ai-tone" {...form.register('toneOverride')} />
              </Field>
            </div>
          ) : null}

          {generateError ? <p className="error-box" role="alert">{generateError}</p> : null}

          <div className="form-status-row">
            <span className="muted">
              {canGenerate
                ? 'Drafts are saved for review — nothing is published automatically.'
                : 'Your role cannot generate AI drafts.'}
            </span>
            <Button type="submit" loading={form.formState.isSubmitting || busy} disabled={!canGenerate}>
              Generate draft
            </Button>
          </div>
        </form>
      </Card>

      <section className="section-block">
        <SectionHeader
          title="Recent generations"
          subtitle="Applying turns a reviewed draft into real plans, posts or captions."
        />
        <GenerationsList
          loading={generations.loading}
          refreshing={generations.refreshing}
          error={generations.error}
          data={generations.data}
          onRetry={generations.refetch}
          companyId={companyId}
          canApply={canGenerate}
        />
      </section>
    </>
  );
}

/** Loading, error, empty and populated are four distinct states, all carded. */
function GenerationsList({
  loading,
  refreshing,
  error,
  data,
  onRetry,
  companyId,
  canApply,
}: {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  data: AiGeneration[] | null;
  onRetry: () => void;
  companyId: string;
  canApply: boolean;
}) {
  if (loading) return <Card><LoadingState label="Loading generations…" /></Card>;
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState title="No AI drafts yet" description="Generate a content plan, captions or post ideas above." />
      </Card>
    );
  }

  return (
    <div className="stack-list">
      {refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
      {data.map((generation) => (
        <GenerationCard key={generation.id} companyId={companyId} generation={generation} canApply={canApply} />
      ))}
    </div>
  );
}

/* ---------- Output rendering ---------- */

type PlanPost = { title?: string; caption?: string; platform?: string; contentType?: string; visualBrief?: string; suggestedDate?: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function PlanPostRow({ post, index }: { post: PlanPost; index: number }) {
  return (
    <div className="bordered-row">
      <div className="bordered-row__head">
        <strong>{post.title ?? `Post ${index + 1}`}</strong>
        <div className="bordered-row__meta">
          {post.platform ? <Badge tone="neutral">{humanize(post.platform)}</Badge> : null}
          {post.contentType ? <Badge tone="neutral">{humanize(post.contentType)}</Badge> : null}
        </div>
      </div>
      {post.caption ? <p className="pre-wrap">{post.caption}</p> : null}
      {post.visualBrief ? <p className="muted pre-wrap">Brief: {post.visualBrief}</p> : null}
      {post.suggestedDate ? <p className="muted">Suggested: {post.suggestedDate}</p> : null}
    </div>
  );
}

/** Last resort when the payload doesn't match any known shape. */
function GenerationOutput({ output }: { output: unknown }) {
  const record = asRecord(output);

  const posts = record && Array.isArray(record.posts) ? (record.posts as PlanPost[]) : null;
  if (posts) {
    return (
      <div className="stack-list">
        {record?.summary ? <p className="muted">{String(record.summary)}</p> : null}
        {posts.map((post, index) => <PlanPostRow key={index} post={post} index={index} />)}
      </div>
    );
  }

  const captions =
    record && Array.isArray(record.captions) ? (record.captions as unknown[])
      : record && Array.isArray(record.options) ? (record.options as unknown[])
        : null;
  if (captions) {
    return (
      <div className="stack-list">
        {captions.map((caption, index) => (
          <div key={index} className="bordered-row pre-wrap">
            {typeof caption === 'string' ? caption : JSON.stringify(caption)}
          </div>
        ))}
      </div>
    );
  }

  const ideas = record && Array.isArray(record.ideas) ? (record.ideas as unknown[]) : null;
  if (ideas) {
    return (
      <div className="stack-list">
        {ideas.map((idea, index) => {
          const ideaRecord = asRecord(idea);
          return (
            <div key={index} className="bordered-row">
              {ideaRecord ? (
                <>
                  <strong>{String(ideaRecord.title ?? `Idea ${index + 1}`)}</strong>
                  {ideaRecord.caption ? <p className="pre-wrap">{String(ideaRecord.caption)}</p> : null}
                </>
              ) : (
                <span>{String(idea)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <pre className="ai-output">
      {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
    </pre>
  );
}

function GenerationCard({ companyId, generation, canApply }: { companyId: string; generation: AiGeneration; canApply: boolean }) {
  const [applied, setApplied] = useState(Boolean(generation.appliedAt));
  const invalidateKeys = [
    ['companies', companyId, 'ai-generations'],
    ['companies', companyId, 'posts'],
    ['companies', companyId, 'content-plans'],
  ];

  const record = asRecord(generation.output);
  const title = (record?.title as string | undefined) ?? humanize(generation.type);

  const shared = {
    companyId,
    generation,
    canApply,
    applied,
    onApplied: () => setApplied(true),
    invalidateKeys,
  };

  return (
    <Card className="generation-card">
      <div className="generation-card__head">
        <div>
          <strong>{title}</strong>
          {generation.prompt ? <p className="muted">{generation.prompt}</p> : null}
        </div>
        {applied ? <Badge tone="success">Applied</Badge> : <Badge tone="neutral">Draft</Badge>}
      </div>

      {generation.type === AiGenerationType.CONTENT_PLAN_PREVIEW ? <ApplyContentPlan {...shared} />
        : generation.type === AiGenerationType.POST_IDEAS ? <ApplyPostIdeas {...shared} />
          : <ApplyCaptions {...shared} />}

      <div className="generation-card__footer">
        <span>{formatDateTime(generation.createdAt)}</span>
      </div>
    </Card>
  );
}

type ApplyProps = {
  companyId: string;
  generation: AiGeneration;
  canApply: boolean;
  applied: boolean;
  onApplied: () => void;
  invalidateKeys: (readonly unknown[])[];
};

function ApplyContentPlan({ companyId, generation, canApply, applied, onApplied, invalidateKeys }: ApplyProps) {
  const apply = useMutation(aiService.applyContentPlan, { invalidateKeys });
  const [titleOverride, setTitleOverride] = useState('');
  const [createPosts, setCreatePosts] = useState(true);
  const record = asRecord(generation.output);
  const posts = record && Array.isArray(record.posts) ? (record.posts as PlanPost[]) : [];

  const run = async () => {
    const result = await apply.mutate(companyId, generation.id, { titleOverride, createPosts });
    if (result) { onApplied(); toast.success('Content plan applied.'); }
  };

  return (
    <>
      {/* Unrecognised payload — show it raw rather than an empty card with a
          lone Apply button, which is what the previous version rendered. */}
      {posts.length === 0 ? <GenerationOutput output={generation.output} /> : (
        <>
          {record?.summary ? <p className="muted">{String(record.summary)}</p> : null}
          <div className="stack-list">
            {posts.map((post, index) => <PlanPostRow key={index} post={post} index={index} />)}
          </div>
        </>
      )}

      {!applied ? (
        <div className="form-grid">
          <Field label="Title override" htmlFor={`title-${generation.id}`} hint="Optional. Rename the plan when applying.">
            <Input id={`title-${generation.id}`} value={titleOverride} onChange={(e) => setTitleOverride(e.target.value)} />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={createPosts} onChange={(e) => setCreatePosts(e.target.checked)} />
            <span>Create posts from this plan</span>
          </label>
        </div>
      ) : null}

      <div className="generation-actions">
        <Button size="sm" onClick={run} loading={apply.loading} disabled={!canApply || applied}>
          {applied ? 'Applied' : 'Apply plan'}
        </Button>
      </div>
      {apply.error ? <p className="error-box" role="alert">{apply.error}</p> : null}
    </>
  );
}

function ApplyPostIdeas({ companyId, generation, canApply, applied, onApplied, invalidateKeys }: ApplyProps) {
  const apply = useMutation(aiService.applyPostIdea, { invalidateKeys });
  const [appliedIndexes, setAppliedIndexes] = useState<number[]>([]);
  // Which row is in flight. A shared boolean spun every button at once.
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const record = asRecord(generation.output);
  const ideas = record && Array.isArray(record.ideas) ? (record.ideas as unknown[]) : [];

  const run = async (ideaIndex: number) => {
    setPendingIndex(ideaIndex);
    try {
      const result = await apply.mutate(companyId, generation.id, { ideaIndex });
      if (result) {
        setAppliedIndexes((prev) => [...prev, ideaIndex]);
        onApplied();
        toast.success('Post created from idea.');
      }
    } finally {
      setPendingIndex(null);
    }
  };

  if (ideas.length === 0) return <GenerationOutput output={generation.output} />;

  return (
    <div className="stack-list">
      {ideas.map((idea, index) => {
        const ideaRecord = asRecord(idea);
        const isApplied = applied || appliedIndexes.includes(index);
        return (
          <div key={index} className="bordered-row">
            <div className="bordered-row__head">
              <strong>{String(ideaRecord?.title ?? `Idea ${index + 1}`)}</strong>
              <Button
                size="sm"
                onClick={() => run(index)}
                loading={pendingIndex === index}
                disabled={!canApply || isApplied || pendingIndex !== null}
              >
                {isApplied ? 'Created' : 'Apply this idea'}
              </Button>
            </div>
            {ideaRecord?.caption ? <p className="pre-wrap">{String(ideaRecord.caption)}</p> : null}
            {!ideaRecord ? <span>{String(idea)}</span> : null}
          </div>
        );
      })}
      {apply.error ? <p className="error-box" role="alert">{apply.error}</p> : null}
    </div>
  );
}

function ApplyCaptions({ companyId, generation, canApply, applied, onApplied, invalidateKeys }: ApplyProps) {
  const apply = useMutation(aiService.applyCaption, { invalidateKeys });
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const record = asRecord(generation.output);
  const captions =
    record && Array.isArray(record.captions) ? (record.captions as unknown[])
      : record && Array.isArray(record.options) ? (record.options as unknown[])
        : [];
  const postId = generation.input?.postId;

  const run = async (captionIndex: number) => {
    if (!postId) { toast.error('This caption has no target post.'); return; }
    setPendingIndex(captionIndex);
    try {
      const result = await apply.mutate(companyId, generation.id, { postId, captionIndex });
      if (result) { setAppliedIndex(captionIndex); onApplied(); toast.success('Caption applied to post.'); }
    } finally {
      setPendingIndex(null);
    }
  };

  if (captions.length === 0) return <GenerationOutput output={generation.output} />;

  return (
    <div className="stack-list">
      {!postId ? <p className="muted">No target post on this caption generation; it cannot be applied.</p> : null}
      {captions.map((caption, index) => {
        const isApplied = applied || appliedIndex === index;
        return (
          <div key={index} className="bordered-row">
            <p className="pre-wrap">{typeof caption === 'string' ? caption : JSON.stringify(caption)}</p>
            <div className="generation-actions">
              <Button
                size="sm"
                onClick={() => run(index)}
                loading={pendingIndex === index}
                disabled={!canApply || !postId || isApplied || pendingIndex !== null}
              >
                {isApplied ? 'Applied' : 'Apply to post'}
              </Button>
            </div>
          </div>
        );
      })}
      {apply.error ? <p className="error-box" role="alert">{apply.error}</p> : null}
    </div>
  );
}
