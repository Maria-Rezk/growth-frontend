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
import { useAsync, useMutation } from '@/hooks/useAsync';
import { scopeDraftKey, useFormDraft } from '@/hooks/useFormDraft';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { aiService, AiGenerationType, type AiGeneration } from '@/services/ai';
import { contentService } from '@/services/content';
import { queryKeys } from '@/lib/queryClient';
import { CompanyMembershipRole } from '@/types/domain';
import { humanize } from '@/utils/format';
import { GenerationsList } from '@/components/domain/ai/GenerationsList';

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
  const { user } = useAuth();
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

  // A goal or brief can be long enough to be real work — restore it after an
  // accidental refresh. Not keyed on the output type: switching type mid-draft
  // (a common way to explore the form) must not lose what was already typed.
  // Keyed on the signed-in user too, so a shared browser never resurfaces one
  // person's half-written brief in someone else's session.
  const draft = useFormDraft(scopeDraftKey(user?.id, `ai-studio:${companyId}`), form);

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

    if (result) {
      toast.success('AI draft generated. Review it before applying.');
      draft.discard();
    }
  });

  const postOptions = posts.data ?? [];

  return (
    <>
      <PageHeader
        title="AI studio"
        subtitle="The model drafts, a human reviews, the system applies. Nothing reaches a client unreviewed."
        action={<AiUsage generations={generations.data} />}
      />

      <Card>
        <CardHeader title="New draft" subtitle="Choose the output type and give clear brand-specific direction." />
        {draft.restored ? <p className="muted">Restored what you were writing before.</p> : null}
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


/**
 * Is the AI earning its place? "12 of 30 applied" is the number that says
 * so — a draft that never becomes a plan, post or caption cost a review
 * and produced nothing.
 */
function AiUsage({ generations }: { generations: AiGeneration[] | null }) {
  if (!generations?.length) return null;
  const applied = generations.filter((generation) => generation.appliedAt).length;
  const rate = Math.round((applied / generations.length) * 100);
  return (
    <span className={rate < 30 ? 'freshness freshness--stale' : 'freshness'} title="Drafts that were applied as a plan, post ideas or a caption">
      {applied} of {generations.length} applied · {rate}%
    </span>
  );
}
