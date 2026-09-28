import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import {
  demoContentPlans,
  demoDelay,
  demoPostComments,
  demoPostLogs,
  demoPosts,
  demoTasks,
  demoUser,
  filterList,
  makeId,
  pushNotification,
} from '@/services/demoStore';
import { attachmentsService } from '@/services/attachments';
import { PostReviewErrorCode } from '@/types/domain';
import type {
  ContentPlan,
  ContentPost,
  ListParams,
  PostApprovalLog,
  PostComment,
  PostStages,
  PostStatus,
} from '@/types/domain';

/** Demo-only: the stages object the API computes from sequenced tasks on the post. */
function demoStages(postId: string): PostStages | undefined {
  const staged = demoTasks.filter((task) => task.relatedEntityType === 'POST' && task.relatedEntityId === postId && typeof task.sequence === 'number');
  if (!staged.length) return undefined;
  const counted = staged.filter((task) => task.status !== 'CANCELED');
  const open = counted
    .filter((task) => task.status !== 'DONE')
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((task) => ({ taskId: task.id, title: task.title, sequence: task.sequence ?? 0, status: task.status }));
  return { total: counted.length, done: counted.length - open.length, open };
}

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
      return demoDelay({ ...post, stages: demoStages(postId) });
    }
    const response = await http.get(apiRoutes.posts.detail(companyId, postId));
    return unwrap<ContentPost>(response.data);
  },

  async createPost(companyId: string, payload: Partial<ContentPost> & { attachmentFileIds?: string[] }): Promise<ContentPost> {
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
      for (const fileId of payload.attachmentFileIds ?? []) {
        await attachmentsService.add(companyId, { entityType: 'POST', entityId: post.id }, fileId);
      }
      return demoDelay(post);
    }
    const { attachmentFileIds, ...rest } = payload;
    const response = await http.post(apiRoutes.posts.list(companyId), {
      ...rest,
      attachmentFileIds: attachmentFileIds?.length ? attachmentFileIds : undefined,
    });
    return unwrap<ContentPost>(response.data);
  },

  /**
   * Edits the content of a post — never its status.
   *
   * `status` is stripped from the payload on purpose. A post's status belongs
   * to the five approval operations below (submit-review, approve,
   * request-changes, reject, publish): each one checks the caller's role,
   * writes an approval log and notifies the people waiting on it. A PATCH that
   * carries `status` bypasses all three, which is how a post could go from
   * Draft straight to Published without the client ever seeing it.
   *
   * The backend fix is to drop `status` from `UpdateContentPostDto`; this is
   * the same rule enforced on the client so the app never depends on that door
   * being open.
   */
  async updatePost(companyId: string, postId: string, payload: Partial<ContentPost>): Promise<ContentPost> {
    const { status: _status, ...content } = payload;

    if (env.demoMode) {
      const post = demoPosts.find((item) => item.companyId === companyId && item.id === postId);
      if (!post) throw new Error('Post not found.');
      Object.assign(post, content, { updatedAt: new Date().toISOString() });
      return demoDelay(post);
    }
    const response = await http.patch(apiRoutes.posts.detail(companyId, postId), content);
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
  // 409 STAGES_OPEN (with openTaskIds + stages) while any staged task on the post is open.
  async submitReview(companyId: string, postId: string, note?: string): Promise<ContentPost> {
    if (env.demoMode) {
      const stages = demoStages(postId);
      if (stages?.open.length) {
        throw Object.assign(new Error(`${stages.open.length} stage${stages.open.length === 1 ? ' is' : 's are'} still open on this post.`), {
          statusCode: 409,
          code: PostReviewErrorCode.STAGES_OPEN,
          openTaskIds: stages.open.map((stage) => stage.taskId),
          stages,
        });
      }
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

  /*
    There is deliberately no `setStatus` here. It existed as a thin wrapper
    around `updatePost({ status })` — a second, unaudited way to move a post
    through the workflow. Use the approval operations above instead.
  */

  async approvalLogs(companyId: string, postId: string): Promise<PostApprovalLog[]> {
    if (env.demoMode) return demoDelay(demoPostLogs.filter((log) => log.postId === postId));
    const response = await http.get(apiRoutes.posts.approvalLogs(companyId, postId));
    const raw = unwrap<RawApprovalLog[]>(response.data);
    return (Array.isArray(raw) ? raw : []).map(normalizeApprovalLog);
  },
};