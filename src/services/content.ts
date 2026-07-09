import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import {
  demoContentPlans,
  demoDelay,
  demoPostAssets,
  demoPostComments,
  demoPostLogs,
  demoPosts,
  demoUser,
  filterList,
  makeId,
  pushNotification,
} from '@/services/demoStore';
import type {
  ContentPlan,
  ContentPost,
  ListParams,
  PostApprovalLog,
  PostAsset,
  PostComment,
  PostStatus,
} from '@/types/domain';

function setDemoPostStatus(postId: string, status: PostStatus, action: string, note?: string) {
  const post = demoPosts.find((item) => item.id === postId);
  if (!post) throw new Error('Post not found.');
  post.status = status;
  post.updatedAt = new Date().toISOString();
  demoPostLogs.unshift({ id: makeId('approval-log'), postId, action, actorId: demoUser.id, actor: demoUser, note, createdAt: new Date().toISOString() });
  return post;
}

// ---------------------------------------------------------------------------
// Backend response normalizers.
// The live API uses different field names than the frontend types:
//   comment  -> body
//   userId   -> authorId
// It also returns extra fields (isInternal, fromStatus, toStatus) we keep.
// Normalizing here means no other file in the app has to know about this.
// ---------------------------------------------------------------------------

type RawComment = {
  id: string;
  companyId?: string;
  postId: string;
  userId?: string;
  authorId?: string;
  comment?: string;
  body?: string;
  isInternal?: boolean;
  createdAt?: string;
  author?: PostComment['author'];
};

function normalizeComment(raw: RawComment): PostComment {
  return {
    id: raw.id,
    postId: raw.postId,
    body: raw.comment ?? raw.body ?? '',
    authorId: raw.userId ?? raw.authorId,
    author: raw.author,
    isInternal: raw.isInternal ?? false,
    createdAt: raw.createdAt,
  };
}

type RawApprovalLog = {
  id: string;
  companyId?: string;
  postId: string;
  userId?: string;
  actorId?: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  actor?: PostApprovalLog['actor'];
};

function normalizeApprovalLog(raw: RawApprovalLog): PostApprovalLog {
  return {
    id: raw.id,
    postId: raw.postId,
    action: raw.action,
    actorId: raw.userId ?? raw.actorId,
    actor: raw.actor,
    note: raw.note ?? undefined,
    fromStatus: raw.fromStatus,
    toStatus: raw.toStatus,
    createdAt: raw.createdAt,
  };
}

// Workflow endpoints return an envelope like { post, approvalLog, comment }.
// Extract the post so callers always receive a ContentPost.
function extractPost(data: unknown): ContentPost {
  const unwrapped = unwrap<Record<string, unknown>>(data as Record<string, unknown>);
  if (unwrapped && typeof unwrapped === 'object' && 'post' in unwrapped && unwrapped.post) {
    return unwrapped.post as ContentPost;
  }
  return unwrapped as unknown as ContentPost;
}

export const contentService = {
  async listPlans(companyId: string): Promise<ContentPlan[]> {
    if (env.demoMode) return demoDelay(demoContentPlans.filter((plan) => plan.companyId === companyId));
    const response = await http.get(apiRoutes.contentPlans.list(companyId));
    return unwrap<ContentPlan[]>(response.data);
  },

  async createPlan(
    companyId: string,
    payload: { title: string; month?: number; year?: number; goal?: string },
  ): Promise<ContentPlan> {
    if (env.demoMode) {
      const plan: ContentPlan = {
        id: makeId('plan'),
        companyId,
        title: payload.title,
        month: payload.month,
        year: payload.year,
        goal: payload.goal,
        createdAt: new Date().toISOString(),
      };
      demoContentPlans.unshift(plan);
      return demoDelay(plan);
    }
    const response = await http.post(apiRoutes.contentPlans.create(companyId), payload);
    return unwrap<ContentPlan>(response.data);
  },

  async listPosts(companyId: string, params?: ListParams): Promise<ContentPost[]> {
    if (env.demoMode) return demoDelay(filterList(demoPosts.filter((post) => post.companyId === companyId), params));
    const response = await http.get(apiRoutes.posts.list(companyId), { params });
    return unwrap<ContentPost[]>(response.data);
  },

  async getPost(companyId: string, postId: string): Promise<ContentPost> {
    if (env.demoMode) {
      const post = demoPosts.find((item) => item.companyId === companyId && item.id === postId);
      if (!post) throw new Error('Post not found.');
      return demoDelay(post);
    }
    const response = await http.get(apiRoutes.posts.detail(companyId, postId));
    return unwrap<ContentPost>(response.data);
  },

  async createPost(companyId: string, payload: Partial<ContentPost>): Promise<ContentPost> {
    if (env.demoMode) {
      const post: ContentPost = {
        id: makeId('post'),
        companyId,
        title: payload.title ?? 'Untitled post',
        caption: payload.caption,
        visualBrief: payload.visualBrief,
        platform: payload.platform,
        contentType: payload.contentType,
        status: payload.status ?? 'DRAFT',
        scheduledAt: payload.scheduledAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      demoPosts.unshift(post);
      return demoDelay(post);
    }
    const response = await http.post(apiRoutes.posts.list(companyId), payload);
    return unwrap<ContentPost>(response.data);
  },

  async updatePost(companyId: string, postId: string, payload: Partial<ContentPost>): Promise<ContentPost> {
    if (env.demoMode) {
      const post = demoPosts.find((item) => item.companyId === companyId && item.id === postId);
      if (!post) throw new Error('Post not found.');
      Object.assign(post, payload, { updatedAt: new Date().toISOString() });
      return demoDelay(post);
    }
    const response = await http.patch(apiRoutes.posts.detail(companyId, postId), payload);
    return unwrap<ContentPost>(response.data);
  },

  async comments(companyId: string, postId: string): Promise<PostComment[]> {
    if (env.demoMode) return demoDelay(demoPostComments.filter((comment) => comment.postId === postId));
    const response = await http.get(apiRoutes.posts.comments(companyId, postId));
    const raw = unwrap<RawComment[]>(response.data);
    return (Array.isArray(raw) ? raw : []).map(normalizeComment);
  },

  // Backend contract (verified): POST { comment: string, isInternal: boolean }
  // Validation: comment must be at least 1 character.
  async addComment(companyId: string, postId: string, body: string, isInternal = false): Promise<PostComment> {
    if (env.demoMode) {
      const comment: PostComment = {
        id: makeId('post-comment'),
        postId,
        body,
        authorId: demoUser.id,
        author: demoUser,
        isInternal,
        createdAt: new Date().toISOString(),
      };
      demoPostComments.unshift(comment);
      pushNotification({ type: 'POST_COMMENTED', title: 'New post comment', message: body, readAt: null, relatedEntityType: 'POST', relatedEntityId: postId });
      return demoDelay(comment);
    }
    const response = await http.post(apiRoutes.posts.comments(companyId, postId), {
      comment: body,
      isInternal,
    });
    return normalizeComment(unwrap<RawComment>(response.data));
  },

  // All workflow transitions accept an optional { note } body (verified in API tests).
  // Always send a JSON object so strict DTO validation never receives an empty body.
  async submitReview(companyId: string, postId: string, note?: string): Promise<ContentPost> {
    if (env.demoMode) {
      const post = setDemoPostStatus(postId, 'READY_FOR_CLIENT', 'SUBMITTED_TO_CLIENT', note);
      pushNotification({ type: 'POST_SUBMITTED_TO_CLIENT', title: 'Post submitted to client', message: post.title, readAt: null, relatedEntityType: 'POST', relatedEntityId: postId });
      return demoDelay(post);
    }
    const response = await http.post(apiRoutes.posts.submitReview(companyId, postId), { note: note || undefined });
    return extractPost(response.data);
  },

  async approve(companyId: string, postId: string, note?: string): Promise<ContentPost> {
    if (env.demoMode) {
      const post = setDemoPostStatus(postId, 'APPROVED', 'APPROVED', note);
      pushNotification({ type: 'POST_APPROVED', title: 'Post approved', message: post.title, readAt: null, relatedEntityType: 'POST', relatedEntityId: postId });
      return demoDelay(post);
    }
    const response = await http.post(apiRoutes.posts.approve(companyId, postId), { note: note || undefined });
    return extractPost(response.data);
  },

  async requestChanges(companyId: string, postId: string, note?: string): Promise<ContentPost> {
    if (env.demoMode) {
      const post = setDemoPostStatus(postId, 'CHANGES_REQUESTED', 'CHANGES_REQUESTED', note);
      pushNotification({ type: 'POST_CHANGES_REQUESTED', title: 'Changes requested', message: note ?? post.title, readAt: null, relatedEntityType: 'POST', relatedEntityId: postId });
      return demoDelay(post);
    }
    const response = await http.post(apiRoutes.posts.requestChanges(companyId, postId), { note: note || undefined });
    return extractPost(response.data);
  },

  async reject(companyId: string, postId: string, note?: string): Promise<ContentPost> {
    if (env.demoMode) return demoDelay(setDemoPostStatus(postId, 'CANCELED', 'REJECTED', note));
    const response = await http.post(apiRoutes.posts.reject(companyId, postId), { note: note || undefined });
    return extractPost(response.data);
  },

  async publish(companyId: string, postId: string, publishedUrl?: string, note?: string): Promise<ContentPost> {
    if (env.demoMode) {
      const post = setDemoPostStatus(postId, 'PUBLISHED', 'PUBLISHED', note);
      post.publishedUrl = publishedUrl;
      return demoDelay(post);
    }
    const response = await http.post(apiRoutes.posts.publish(companyId, postId), {
      publishedUrl,
      note: note || undefined,
    });
    return extractPost(response.data);
  },

  async setStatus(companyId: string, postId: string, status: PostStatus): Promise<ContentPost> {
    return contentService.updatePost(companyId, postId, { status });
  },

  async approvalLogs(companyId: string, postId: string): Promise<PostApprovalLog[]> {
    if (env.demoMode) return demoDelay(demoPostLogs.filter((log) => log.postId === postId));
    const response = await http.get(apiRoutes.posts.approvalLogs(companyId, postId));
    const raw = unwrap<RawApprovalLog[]>(response.data);
    return (Array.isArray(raw) ? raw : []).map(normalizeApprovalLog);
  },

  async assets(companyId: string, postId: string): Promise<PostAsset[]> {
    if (env.demoMode) return demoDelay(demoPostAssets.filter((asset) => asset.postId === postId));
    const response = await http.get(apiRoutes.posts.assets(companyId, postId));
    return unwrap<PostAsset[]>(response.data);
  },

  async attachAsset(companyId: string, postId: string, fileId: string): Promise<PostAsset> {
    if (env.demoMode) {
      const asset: PostAsset = { id: makeId('asset'), postId, fileId, createdAt: new Date().toISOString() };
      demoPostAssets.unshift(asset);
      return demoDelay(asset);
    }
    const response = await http.post(apiRoutes.posts.assets(companyId, postId), {
      fileId,
      assetType: 'DESIGN',
    });
    return unwrap<PostAsset>(response.data);
  },

  async removeAsset(companyId: string, postId: string, assetId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.delete(apiRoutes.posts.asset(companyId, postId, assetId));
  },
};