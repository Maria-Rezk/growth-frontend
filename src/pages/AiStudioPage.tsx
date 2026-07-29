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
import { EmptyState } from '@/components/ui/State';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useCompany } from '@/context/CompanyContext';
import { aiService, AiGenerationType, type AiGeneration } from '@/services/ai';
import { CompanyMembershipRole, type ContentPost } from '@/types/domain';
import { formatDateTime, humanize } from '@/utils/format';

const now = new Date();

const generateSchema = z
  .object({
    type: z.enum([AiGenerationType.CONTENT_PLAN_PREVIEW, AiGenerationType.CAPTION_SUGGESTION, AiGenerationType.POST_IDEAS]),
    goal: z.string().trim().optional(),
    language: z.string().trim().min(1).default('ar'),
    // content plan
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().optional(),
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
  // Goal is required for content-plan and post-ideas, but not for captions.
  .refine(
    (v) => v.type === AiGenerationType.CAPTION_SUGGESTION || (v.goal?.trim().length ?? 0) >= 5,
    { message: 'Goal is required (at least 5 characters).', path: ['goal'] },
  );

type GenerateForm = z.infer<typeof generateSchema>;

const GENERATOR_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
];

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'WHATSAPP', 'WEBSITE'];
const CONTENT_TYPES = ['POST', 'REEL', 'STORY', 'CAROUSEL', 'VIDEO'];

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
  const invalidate = [['companies', companyId, 'ai-generations']];
  const genPlan = useMutation(aiService.generateContentPlanPreview, { invalidateKeys: invalidate });
  const genIdeas = useMutation(aiService.generatePostIdeas, { invalidateKeys: invalidate });
  const genCaption = useMutation(aiService.generateCaption, { invalidateKeys: invalidate });

  const form = useForm<GenerateForm>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      type: AiGenerationType.CONTENT_PLAN_PREVIEW,
      goal: '', language: 'ar',
      month: now.getMonth() + 1, year: now.getFullYear(), numberOfPosts: 8,
      count: 6, platform: 'INSTAGRAM', contentType: 'CAROUSEL',
      postId: '', numberOfOptions: 3, toneOverride: '',
    },
    mode: 'onBlur',
  });
  const type = form.watch('type');
  const busy = genPlan.loading || genIdeas.loading || genCaption.loading;

  const submit = form.handleSubmit(async (v) => {
    let result: AiGeneration | null = null;
    if (v.type === AiGenerationType.CONTENT_PLAN_PREVIEW) {
      result = await genPlan.mutate(companyId, {
        month: v.month!, year: v.year!, goal: v.goal ?? '',
        numberOfPosts: v.numberOfPosts, language: v.language,
        platforms: v.platform ? [v.platform] : undefined,
      });
    } else if (v.type === AiGenerationType.POST_IDEAS) {
      result = await genIdeas.mutate(companyId, {
        goal: v.goal ?? '', count: v.count, language: v.language,
        platform: v.platform, contentType: v.contentType,
      });
    } else {
      if (!v.postId?.trim()) { toast.error('A target post ID is required for captions.'); return; }
      result = await genCaption.mutate(companyId, {
        postId: v.postId.trim(), language: v.language,
        numberOfOptions: v.numberOfOptions, toneOverride: v.toneOverride || undefined,
      });
    }
    if (result) {
      toast.success('AI draft generated. Review it before applying.');
      // invalidateKeys already refreshes the list; no manual refetch needed.
    }
  });

  return (
    <>
      <PageHeader title="AI studio" subtitle="The model drafts, a human reviews, the system applies. Nothing reaches a client unreviewed." />

      <Card>
        <CardHeader title="New draft" subtitle="Choose the output type and give clear brand-specific direction." />
        <form className="form-grid form-card" onSubmit={submit} noValidate>
          <div className="grid-2">
            <Field label="Output type" htmlFor="ai-type">
              <Select id="ai-type" {...form.register('type')}>
                {Object.values(AiGenerationType).map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </Select>
            </Field>
            <Field label="Language" htmlFor="ai-language" hint="e.g. ar or en">
              <Input id="ai-language" {...form.register('language')} />
            </Field>
          </div>

          {type !== AiGenerationType.CAPTION_SUGGESTION ? (
            <Field label="Goal" htmlFor="ai-goal" hint="What this content should achieve." error={form.formState.errors.goal?.message}>
              <Textarea id="ai-goal" rows={3} {...form.register('goal')} />
            </Field>
          ) : null}

          {type === AiGenerationType.CONTENT_PLAN_PREVIEW ? (
            <div className="grid-2">
              <Field label="Month" htmlFor="ai-month"><Input id="ai-month" type="number" {...form.register('month')} /></Field>
              <Field label="Year" htmlFor="ai-year"><Input id="ai-year" type="number" {...form.register('year')} /></Field>
              <Field label="Number of posts" htmlFor="ai-nposts"><Input id="ai-nposts" type="number" {...form.register('numberOfPosts')} /></Field>
              <Field label="Platform" htmlFor="ai-plat"><Select id="ai-plat" {...form.register('platform')}>{PLATFORMS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select></Field>
            </div>
          ) : null}

          {type === AiGenerationType.POST_IDEAS ? (
            <div className="grid-2">
              <Field label="Count" htmlFor="ai-count"><Input id="ai-count" type="number" {...form.register('count')} /></Field>
              <Field label="Platform" htmlFor="ai-plat2"><Select id="ai-plat2" {...form.register('platform')}>{PLATFORMS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select></Field>
              <Field label="Content type" htmlFor="ai-ctype"><Select id="ai-ctype" {...form.register('contentType')}>{CONTENT_TYPES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
            </div>
          ) : null}

          {type === AiGenerationType.CAPTION_SUGGESTION ? (
            <div className="grid-2">
              <Field label="Target post ID" htmlFor="ai-post" hint="Required for captions."><Input id="ai-post" {...form.register('postId')} /></Field>
              <Field label="Number of options" htmlFor="ai-nopt"><Input id="ai-nopt" type="number" {...form.register('numberOfOptions')} /></Field>
              <Field label="Tone override" htmlFor="ai-tone" hint="Optional."><Input id="ai-tone" {...form.register('toneOverride')} /></Field>
            </div>
          ) : null}

          {(genPlan.error || genIdeas.error || genCaption.error) ? <p className="error-box" role="alert">{genPlan.error || genIdeas.error || genCaption.error}</p> : null}
          <div>
            <Button type="submit" loading={form.formState.isSubmitting || busy} disabled={!canGenerate}>
              {canGenerate ? 'Generate draft' : 'No permission to generate'}
            </Button>
          </div>
        </form>
      </Card>

      <section className="section-block">
        <SectionHeader
          title="Recent generations"
          subtitle="Applying turns a reviewed draft into real plans, posts or captions."
        />
        {generations.loading ? <p className="muted">Loading generations…</p> : null}
        {generations.refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
        {generations.error ? <p className="error-box" role="alert">{generations.error}</p> : null}
        {!generations.loading && !generations.error && (generations.data?.length ?? 0) === 0 ? (
          <EmptyState title="No AI drafts yet" description="Generate a content plan, captions or post ideas above." />
        ) : null}
        <div className="form-grid">
          {(generations.data ?? []).map((generation) => (
            <GenerationCard key={generation.id} companyId={companyId} generation={generation} canApply={canGenerate} />
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------- Output rendering ---------- */

type PlanPost = { title?: string; caption?: string; platform?: string; contentType?: string; visualBrief?: string; suggestedDate?: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function GenerationOutput({ output }: { output: unknown }) {
  const record = asRecord(output);

  // Content plan preview: { title, summary, posts: [...] }
  const posts = record && Array.isArray(record.posts) ? (record.posts as PlanPost[]) : null;
  if (posts) {
    return (
      <div className="stack-list">
        {record?.summary ? <p className="muted">{String(record.summary)}</p> : null}
        {posts.map((post, index) => (
          <div key={index} className="bordered-row">
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
        ))}
      </div>
    );
  }

  // Captions: { captions: [...] } or { options: [...] }
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

  // Post ideas: { ideas: [...] }
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

  // Fallback: raw JSON for anything we don't recognize.
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

  return (
    <Card className="generation-card">
      <div className="generation-card__head">
        <div>
          <strong>{title}</strong>
          {generation.prompt ? <p className="muted">{generation.prompt}</p> : null}
        </div>
        {applied ? <Badge tone="success">Applied</Badge> : <Badge tone="neutral">Draft</Badge>}
      </div>

      {generation.type === AiGenerationType.CONTENT_PLAN_PREVIEW ? (
        <ApplyContentPlan companyId={companyId} generation={generation} canApply={canApply} applied={applied} onApplied={() => setApplied(true)} invalidateKeys={invalidateKeys} />
      ) : generation.type === AiGenerationType.POST_IDEAS ? (
        <ApplyPostIdeas companyId={companyId} generation={generation} canApply={canApply} applied={applied} onApplied={() => setApplied(true)} invalidateKeys={invalidateKeys} />
      ) : (
        <ApplyCaptions companyId={companyId} generation={generation} canApply={canApply} applied={applied} onApplied={() => setApplied(true)} invalidateKeys={invalidateKeys} />
      )}

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
      {record?.summary ? <p className="muted">{String(record.summary)}</p> : null}
      <div className="stack-list">
        {posts.map((post, index) => (
          <div key={index} className="bordered-row">
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
        ))}
      </div>
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
        <Button size="sm" onClick={run} loading={apply.loading} disabled={!canApply || applied}>{applied ? 'Applied' : 'Apply plan'}</Button>
      </div>
      {apply.error ? <p className="error-box" role="alert">{apply.error}</p> : null}
    </>
  );
}

function ApplyPostIdeas({ companyId, generation, canApply, applied, onApplied, invalidateKeys }: ApplyProps) {
  const apply = useMutation(aiService.applyPostIdea, { invalidateKeys });
  const [appliedIndexes, setAppliedIndexes] = useState<number[]>([]);
  const record = asRecord(generation.output);
  const ideas = record && Array.isArray(record.ideas) ? (record.ideas as unknown[]) : [];

  const run = async (ideaIndex: number) => {
    const result = await apply.mutate(companyId, generation.id, { ideaIndex });
    if (result) { setAppliedIndexes((prev) => [...prev, ideaIndex]); onApplied(); toast.success('Post created from idea.'); }
  };

  if (ideas.length === 0) {
    return <GenerationOutput output={generation.output} />;
  }

  return (
    <div className="stack-list">
      {ideas.map((idea, index) => {
        const ideaRecord = asRecord(idea);
        const isApplied = appliedIndexes.includes(index);
        return (
          <div key={index} className="bordered-row">
            <div className="bordered-row__head">
              <strong>{String(ideaRecord?.title ?? `Idea ${index + 1}`)}</strong>
              <Button size="sm" onClick={() => run(index)} loading={apply.loading} disabled={!canApply || isApplied}>{isApplied ? 'Created' : 'Apply this idea'}</Button>
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
  const record = asRecord(generation.output);
  const captions =
    record && Array.isArray(record.captions) ? (record.captions as unknown[])
      : record && Array.isArray(record.options) ? (record.options as unknown[])
        : [];
  const postId = generation.input?.postId;

  const run = async (captionIndex: number) => {
    if (!postId) { toast.error('This caption has no target post.'); return; }
    const result = await apply.mutate(companyId, generation.id, { postId, captionIndex });
    if (result) { setAppliedIndex(captionIndex); onApplied(); toast.success('Caption applied to post.'); }
  };

  if (captions.length === 0) {
    return <GenerationOutput output={generation.output} />;
  }

  return (
    <div className="stack-list">
      {!postId ? <p className="muted">No target post on this caption generation; cannot apply.</p> : null}
      {captions.map((caption, index) => (
        <div key={index} className="bordered-row">
          <p className="pre-wrap">{typeof caption === 'string' ? caption : JSON.stringify(caption)}</p>
          <div className="generation-actions">
            <Button size="sm" onClick={() => run(index)} loading={apply.loading} disabled={!canApply || !postId || appliedIndex === index}>{appliedIndex === index ? 'Applied' : 'Apply to post'}</Button>
          </div>
        </div>
      ))}
      {apply.error ? <p className="error-box" role="alert">{apply.error}</p> : null}
    </div>
  );
}