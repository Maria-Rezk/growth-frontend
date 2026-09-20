/*
  One AI generation: its output, and the button that applies it to the
  workspace (a content plan, post ideas or a caption). Split out of
  AiStudioPage, which had grown to 600 lines; nothing here changed.
*/
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { Badge } from '@/components/ui/Badge';
import { useMutation } from '@/hooks/useAsync';
import { aiService, AiGenerationType, type AiGeneration } from '@/services/ai';
import { formatDateTime, humanize } from '@/utils/format';

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

export function GenerationCard({ companyId, generation, canApply }: { companyId: string; generation: AiGeneration; canApply: boolean }) {
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
