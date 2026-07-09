import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoPosts, makeId } from '@/services/demoStore';
import type { ContentPost } from '@/types/domain';

export const AiGenerationType = {
  CONTENT_PLAN_PREVIEW: 'CONTENT_PLAN_PREVIEW',
  CAPTION_SUGGESTION: 'CAPTION_SUGGESTION',
  POST_IDEAS: 'POST_IDEAS',
} as const;
export type AiGenerationType = (typeof AiGenerationType)[keyof typeof AiGenerationType];

export interface AiGeneration {
  id: string;
  companyId: string;
  type: AiGenerationType;
  prompt?: string;
  input?: { postId?: string;[key: string]: unknown };
  output?: unknown;
  appliedAt?: string | null;
  createdAt?: string;
}

// Request bodies match the real backend endpoints (Step 7 AI Generator).
export interface ContentPlanPreviewRequest {
  month: number;
  year: number;
  goal: string;
  numberOfPosts?: number;
  language?: string;
  platforms?: string[];
}
export interface PostIdeasRequest {
  goal: string;
  count?: number;
  language?: string;
  platform?: string;
  contentType?: string;
}
export interface CaptionRequest {
  postId: string;
  language?: string;
  numberOfOptions?: number;
  toneOverride?: string;
}

// ---------------------------------------------------------------------------
// Verified backend response shapes (Step 8 Apply AI Output):
//   apply-content-plan -> { contentPlan, posts, application }
//   apply-caption      -> { post, appliedCaption, application }
//   apply-post-idea    -> { post, application }
// The generic unwrap() helper does not know these keys, so we extract them
// explicitly here. Callers receive clean, correctly-typed objects.
// ---------------------------------------------------------------------------

export interface ApplyContentPlanResult {
  contentPlan?: { id: string; title?: string;[key: string]: unknown };
  posts?: ContentPost[];
  application?: Record<string, unknown>;
}

function asEnvelope(data: unknown): Record<string, unknown> {
  const value = unwrap<Record<string, unknown>>(data as Record<string, unknown>);
  return value && typeof value === 'object' ? value : {};
}

// Demo-only in-memory store. Clearly mock data; never used when VITE_DEMO_MODE=false.
const demoGenerations: AiGeneration[] = [];

function buildDemoOutput(type: AiGenerationType, goal: string): unknown {
  if (type === AiGenerationType.CONTENT_PLAN_PREVIEW) {
    return {
      title: 'Mock Monthly Content Plan',
      summary: 'This is a mock AI-generated content plan preview for testing.',
      posts: [
        { title: 'Laser Hair Removal FAQ', platform: 'INSTAGRAM', contentType: 'CAROUSEL', caption: `Based on: ${goal}`, visualBrief: 'Premium carousel with soft colors and five FAQ slides.', suggestedDate: '2026-06-05' },
        { title: 'Behind the Clinic', platform: 'INSTAGRAM', contentType: 'REEL', caption: 'Short clinic tour.', visualBrief: 'Calm reel showing reception and treatment room.', suggestedDate: '2026-06-09' },
      ],
    };
  }
  if (type === AiGenerationType.CAPTION_SUGGESTION) {
    return { note: 'MOCK captions.', captions: [`${goal} — option A`, `${goal} — option B`, `${goal} — option C`] };
  }
  return { note: 'MOCK ideas.', ideas: [`${goal} explainer`, `${goal} behind-the-scenes`, `${goal} myth vs fact`] };
}

function demoGenerate(companyId: string, type: AiGenerationType, goal: string): Promise<AiGeneration> {
  const generation: AiGeneration = {
    id: makeId('ai-generation'),
    companyId,
    type,
    prompt: goal,
    output: buildDemoOutput(type, goal),
    appliedAt: null,
    createdAt: new Date().toISOString(),
  };
  demoGenerations.unshift(generation);
  return demoDelay(generation);
}

export const aiService = {
  async generateContentPlanPreview(companyId: string, payload: ContentPlanPreviewRequest): Promise<AiGeneration> {
    if (env.demoMode) return demoGenerate(companyId, AiGenerationType.CONTENT_PLAN_PREVIEW, payload.goal);
    const response = await http.post(apiRoutes.ai.contentPlanPreview(companyId), payload);
    return unwrap<AiGeneration>(response.data);
  },

  async generatePostIdeas(companyId: string, payload: PostIdeasRequest): Promise<AiGeneration> {
    if (env.demoMode) return demoGenerate(companyId, AiGenerationType.POST_IDEAS, payload.goal);
    const response = await http.post(apiRoutes.ai.postIdeas(companyId), payload);
    return unwrap<AiGeneration>(response.data);
  },

  async generateCaption(companyId: string, payload: CaptionRequest): Promise<AiGeneration> {
    if (env.demoMode) return demoGenerate(companyId, AiGenerationType.CAPTION_SUGGESTION, `caption for ${payload.postId}`);
    const response = await http.post(apiRoutes.ai.caption(companyId), payload);
    return unwrap<AiGeneration>(response.data);
  },

  async listGenerations(companyId: string): Promise<AiGeneration[]> {
    if (env.demoMode) return demoDelay(demoGenerations.filter((item) => item.companyId === companyId));
    const response = await http.get(apiRoutes.ai.generations(companyId));
    return unwrap<AiGeneration[]>(response.data);
  },

  async getGeneration(companyId: string, generationId: string): Promise<AiGeneration> {
    if (env.demoMode) {
      const found = demoGenerations.find((item) => item.id === generationId);
      if (!found) throw new Error('Generation not found.');
      return demoDelay(found);
    }
    const response = await http.get(apiRoutes.ai.generation(companyId, generationId));
    return unwrap<AiGeneration>(response.data);
  },

  async applyContentPlan(
    companyId: string,
    generationId: string,
    options?: { titleOverride?: string; createPosts?: boolean },
  ): Promise<ApplyContentPlanResult> {
    if (env.demoMode) {
      const generation = demoGenerations.find((item) => item.id === generationId);
      if (generation) generation.appliedAt = new Date().toISOString();
      return demoDelay({ contentPlan: { id: makeId('plan'), title: 'Mock plan' }, posts: [] });
    }
    const response = await http.post(apiRoutes.ai.applyContentPlan(companyId, generationId), {
      titleOverride: options?.titleOverride || undefined,
      createPosts: options?.createPosts ?? true,
    });
    const envelope = asEnvelope(response.data);
    return {
      contentPlan: envelope.contentPlan as ApplyContentPlanResult['contentPlan'],
      posts: (envelope.posts as ContentPost[]) ?? [],
      application: envelope.application as Record<string, unknown>,
    };
  },

  async applyCaption(
    companyId: string,
    generationId: string,
    payload: { postId: string; captionIndex?: number },
  ): Promise<ContentPost> {
    if (env.demoMode) {
      const generation = demoGenerations.find((item) => item.id === generationId);
      if (generation) generation.appliedAt = new Date().toISOString();
      const post = demoPosts.find((item) => item.id === payload.postId) ?? demoPosts[0];
      return demoDelay(post);
    }
    const response = await http.post(apiRoutes.ai.applyCaption(companyId, generationId), {
      postId: payload.postId,
      captionIndex: payload.captionIndex ?? 0,
    });
    const envelope = asEnvelope(response.data);
    // Backend returns { post, appliedCaption, application } — return the post itself.
    return (envelope.post as ContentPost) ?? (envelope as unknown as ContentPost);
  },

  async applyPostIdea(
    companyId: string,
    generationId: string,
    payload: { ideaIndex: number; contentPlanId?: string; scheduledAt?: string },
  ): Promise<ContentPost> {
    if (env.demoMode) {
      const generation = demoGenerations.find((item) => item.id === generationId);
      if (generation) generation.appliedAt = new Date().toISOString();
      return demoDelay(demoPosts[0]);
    }
    const response = await http.post(apiRoutes.ai.applyPostIdea(companyId, generationId), {
      ideaIndex: payload.ideaIndex,
      contentPlanId: payload.contentPlanId || undefined,
      scheduledAt: payload.scheduledAt || undefined,
    });
    const envelope = asEnvelope(response.data);
    // Backend returns { post, application } — return the post itself.
    return (envelope.post as ContentPost) ?? (envelope as unknown as ContentPost);
  },
};