import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import {
  demoDelay,
  demoFiles,
  demoMemberUser,
  demoTaskAttachments,
  demoTaskComments,
  demoTaskLogs,
  demoTasks,
  demoUser,
  filterList,
  makeId,
  moveTaskStatus,
  pushNotification,
} from '@/services/demoStore';
import { filesService } from '@/services/files';
import type {
  ApproverResolution,
  ListParams,
  Paginated,
  Task,
  TaskActivityLog,
  TaskAttachment,
  TaskComment,
  TaskStatus,
  TaskType,
} from '@/types/domain';
import { TaskReviewErrorCode } from '@/types/domain';

// The backend read model returns `taskType`, but the app reads `task.type`.
// Normalize inbound so the wire difference stays isolated in this service.
function normalizeTask(raw: Task & { taskType?: TaskType }): Task {
  return { ...raw, type: raw.type ?? raw.taskType ?? 'GENERAL' };
}

type WireTask = Task & { taskType?: TaskType };

/** The paginated envelope `approval-queue` returns. `unwrap` would strip it down to the array. */
function normalizePaginated(raw: unknown): Paginated<Task> {
  const data = (raw ?? {}) as Partial<Paginated<WireTask>> & { data?: Partial<Paginated<WireTask>> };
  const source = Array.isArray(data.items) ? data : (data.data ?? data);
  const items = Array.isArray(source.items) ? source.items.map(normalizeTask) : [];
  return {
    items,
    total: typeof source.total === 'number' ? source.total : items.length,
    limit: typeof source.limit === 'number' ? source.limit : items.length || 25,
    offset: typeof source.offset === 'number' ? source.offset : 0,
  };
}

/** Demo-only: the shape of the API's review errors, so the demo branch exercises the same handling. */
function demoReviewError(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(message), { statusCode, code });
}

/** Demo-only: a task, or the same 404 the API would raise. */
function demoTask(companyId: string, taskId: string): Task {
  const task = demoTasks.find((item) => item.companyId === companyId && item.id === taskId);
  if (!task) throw new Error('Task not found.');
  return task;
}

function demoLog(taskId: string, action: string, metadata?: Record<string, unknown>) {
  demoTaskLogs.unshift({ id: makeId('task-log'), taskId, action, metadata, createdAt: new Date().toISOString() });
}

export const tasksService = {
  async list(companyId: string, params?: ListParams): Promise<Task[]> {
    if (env.demoMode) return demoDelay(filterList(demoTasks.filter((task) => task.companyId === companyId), params));
    const response = await http.get(apiRoutes.tasks.list(companyId), { params });
    return unwrap<Array<Task & { taskType?: TaskType }>>(response.data).map(normalizeTask);
  },
  async get(companyId: string, taskId: string): Promise<Task> {
    if (env.demoMode) {
      const task = demoTasks.find((item) => item.companyId === companyId && item.id === taskId);
      if (!task) throw new Error('Task not found.');
      return demoDelay(task);
    }
    const response = await http.get(apiRoutes.tasks.detail(companyId, taskId));
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
  },
  async create(companyId: string, payload: Partial<Task> & { relatedEntityType?: string; relatedEntityId?: string; notes?: string }): Promise<Task> {
    if (env.demoMode) {
      const task: Task = {
        id: makeId('task'),
        companyId,
        title: payload.title ?? 'Untitled task',
        description: payload.description,
        status: payload.status ?? 'TODO',
        priority: payload.priority ?? 'MEDIUM',
        type: payload.type ?? 'GENERAL',
        assignedToId: payload.assignedToId,
        assignedTo: payload.assignedTo,
        approverId: payload.approverId ?? null,
        approver: payload.approverId ? demoMemberUser(payload.approverId) : null,
        submittedForReviewAt: null,
        reviewedAt: null,
        reviewNote: null,
        relatedEntityType: payload.relatedEntityType,
        relatedEntityId: payload.relatedEntityId,
        dueDate: payload.dueDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      demoTasks.unshift(task);
      demoTaskLogs.unshift({ id: makeId('task-log'), taskId: task.id, action: 'TASK_CREATED', createdAt: new Date().toISOString() });
      pushNotification({ type: 'TASK_ASSIGNED', title: 'Task created', message: task.title, readAt: null, relatedEntityType: 'TASK', relatedEntityId: task.id });
      return demoDelay(task);
    }
    const body = {
      title: payload.title,
      description: payload.description,
      taskType: payload.type,          // backend expects taskType
      priority: payload.priority,
      dueDate: payload.dueDate,
      assignedToId: payload.assignedToId,
      // Optional. Omitted, the backend reads the responsibility matrix; sent,
      // it must be an active member of this client (422 APPROVER_REQUIRED).
      approverId: payload.approverId || undefined,
      relatedEntityType: payload.relatedEntityType,
      relatedEntityId: payload.relatedEntityId,
      notes: payload.notes,
      // no status — backend assigns the initial status
    };

    const response = await http.post(apiRoutes.tasks.list(companyId), body);
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
  },
  async update(companyId: string, taskId: string, payload: Partial<Task>): Promise<Task> {
    if (env.demoMode) {
      const task = demoTasks.find((item) => item.companyId === companyId && item.id === taskId);
      if (!task) throw new Error('Task not found.');
      if ('approverId' in payload && payload.approverId !== task.approverId) {
        demoLog(taskId, 'TASK_APPROVER_CHANGED', { from: task.approverId ?? null, to: payload.approverId ?? null });
        task.approver = payload.approverId ? demoMemberUser(payload.approverId) : null;
      }
      Object.assign(task, payload, { updatedAt: new Date().toISOString() });
      return demoDelay(task);
    }
    const response = await http.patch(apiRoutes.tasks.detail(companyId, taskId), payload);
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
  },
  async setStatus(companyId: string, taskId: string, status: TaskStatus, note?: string): Promise<Task> {
    if (env.demoMode) {
      const before = demoTask(companyId, taskId);
      if (status === 'IN_REVIEW' || (before.status === 'IN_REVIEW' && status !== 'CANCELED')) {
        throw demoReviewError(409, TaskReviewErrorCode.REVIEW_ACTIONS_ONLY, 'IN_REVIEW is managed by the review actions. Use submit-for-review, approve or request-changes.');
      }
      const task = moveTaskStatus(taskId, status);
      if (status === 'CANCELED') task.submittedForReviewAt = null;
      pushNotification({ type: 'TASK_STATUS_CHANGED', title: 'Task status changed', message: `${task.title} moved to ${status}`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(task);
    }
    const response = await http.patch(apiRoutes.tasks.status(companyId, taskId), { status, note });
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
  },
  /*
    The three review actions. Each answers 200 with the full task, and each
    carries a `code` on failure — callers switch on that, not on the message.
    On any 409 the right reaction is to refresh the task: somebody already
    acted, and retrying would only produce the same answer.
  */
  async submitForReview(companyId: string, taskId: string): Promise<Task> {
    if (env.demoMode) {
      const task = demoTask(companyId, taskId);
      if (!task.approverId) throw demoReviewError(422, TaskReviewErrorCode.APPROVER_REQUIRED, 'This task has no approver. Set one before submitting it for review.');
      if (task.status !== 'TODO' && task.status !== 'IN_PROGRESS') {
        throw demoReviewError(409, TaskReviewErrorCode.INVALID_TRANSITION, `A task in ${task.status} cannot take the action submit-for-review`);
      }
      const from = task.status;
      moveTaskStatus(taskId, 'IN_REVIEW');
      task.submittedForReviewAt = new Date().toISOString();
      demoLog(taskId, 'TASK_SUBMITTED_FOR_REVIEW', { fromStatus: from, toStatus: 'IN_REVIEW', approverId: task.approverId });
      pushNotification({ type: 'TASK_SUBMITTED_FOR_REVIEW', title: 'Task waiting for your review', message: `${task.assignedTo?.fullName ?? 'Someone'} submitted "${task.title}" for your review`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(task);
    }
    const response = await http.post(apiRoutes.tasks.submitForReview(companyId, taskId));
    return normalizeTask(unwrap<WireTask>(response.data));
  },
  async approve(companyId: string, taskId: string): Promise<Task> {
    if (env.demoMode) {
      const task = demoTask(companyId, taskId);
      if (task.status !== 'IN_REVIEW') throw demoReviewError(409, TaskReviewErrorCode.INVALID_TRANSITION, `A task in ${task.status} cannot take the action approve`);
      moveTaskStatus(taskId, 'DONE');
      const now = new Date().toISOString();
      Object.assign(task, { submittedForReviewAt: null, reviewedAt: now, completedAt: now });
      demoLog(taskId, 'TASK_APPROVED', { fromStatus: 'IN_REVIEW', toStatus: 'DONE', approverId: task.approverId });
      pushNotification({ type: 'TASK_APPROVED', title: 'Task approved', message: `${demoUser.fullName} approved "${task.title}"`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(task);
    }
    const response = await http.post(apiRoutes.tasks.approve(companyId, taskId));
    return normalizeTask(unwrap<WireTask>(response.data));
  },
  async requestChanges(companyId: string, taskId: string, note: string): Promise<Task> {
    const trimmed = note.trim();
    if (env.demoMode) {
      const task = demoTask(companyId, taskId);
      if (!trimmed) throw demoReviewError(422, TaskReviewErrorCode.REVIEW_NOTE_REQUIRED, 'Say what needs changing: a note is required.');
      if (task.status !== 'IN_REVIEW') throw demoReviewError(409, TaskReviewErrorCode.INVALID_TRANSITION, `A task in ${task.status} cannot take the action request-changes`);
      moveTaskStatus(taskId, 'IN_PROGRESS');
      Object.assign(task, { submittedForReviewAt: null, reviewedAt: new Date().toISOString(), reviewNote: trimmed });
      demoLog(taskId, 'TASK_CHANGES_REQUESTED', { fromStatus: 'IN_REVIEW', toStatus: 'IN_PROGRESS', approverId: task.approverId, note: trimmed });
      pushNotification({ type: 'TASK_CHANGES_REQUESTED', title: 'Changes requested', message: `${demoUser.fullName} requested changes on "${task.title}": ${trimmed}`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(task);
    }
    const response = await http.post(apiRoutes.tasks.requestChanges(companyId, taskId), { note: trimmed });
    return normalizeTask(unwrap<WireTask>(response.data));
  },
  /**
   * Tasks in review waiting on the caller, oldest submission first. Scoped to
   * one client — somebody who approves on several clients has several queues.
   */
  async approvalQueue(companyId: string, params?: { limit?: number; offset?: number }): Promise<Paginated<Task>> {
    if (env.demoMode) {
      const items = demoTasks
        .filter((task) => task.companyId === companyId && task.status === 'IN_REVIEW' && task.approverId === demoUser.id)
        .sort((a, b) => (a.submittedForReviewAt ?? '').localeCompare(b.submittedForReviewAt ?? ''));
      return demoDelay({ items, total: items.length, limit: params?.limit ?? 25, offset: params?.offset ?? 0 });
    }
    const response = await http.get(apiRoutes.tasks.approvalQueue(companyId), { params });
    return normalizePaginated(response.data);
  },
  /** Who the responsibility matrix says approves this kind of work on this client. */
  async resolveApprover(companyId: string, taskType: TaskType): Promise<ApproverResolution> {
    if (env.demoMode) {
      const resolved = taskType !== 'GENERAL';
      return demoDelay({
        taskType,
        approverId: resolved ? demoUser.id : null,
        reason: resolved ? 'RESOLVED' : 'UNMAPPED_TASK_TYPE',
        areaId: resolved ? 'demo-area-1' : null,
        areaName: resolved ? 'Social Media' : null,
        candidateUserIds: resolved ? [demoUser.id] : [],
      });
    }
    const response = await http.get(apiRoutes.tasks.resolveApprover(companyId), { params: { taskType } });
    const data = unwrap<Partial<ApproverResolution>>(response.data) ?? {};
    return {
      taskType,
      approverId: data.approverId ?? null,
      reason: data.reason ?? 'NO_MATCHING_AREA',
      areaId: data.areaId ?? null,
      areaName: data.areaName ?? null,
      candidateUserIds: Array.isArray(data.candidateUserIds) ? data.candidateUserIds : [],
    };
  },
  async comments(companyId: string, taskId: string): Promise<TaskComment[]> {
    if (env.demoMode) return demoDelay(demoTaskComments.filter((comment) => comment.taskId === taskId));
    const response = await http.get(apiRoutes.tasks.comments(companyId, taskId));
    return unwrap<TaskComment[]>(response.data);
  },
  async addComment(companyId: string, taskId: string, body: string): Promise<TaskComment> {
    if (env.demoMode) {
      const comment: TaskComment = { id: makeId('task-comment'), taskId, body, authorId: demoUser.id, author: demoUser, createdAt: new Date().toISOString() };
      demoTaskComments.unshift(comment);
      pushNotification({ type: 'TASK_COMMENTED', title: 'New task comment', message: body, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(comment);
    }
    const response = await http.post(apiRoutes.tasks.comments(companyId, taskId), { comment: body });
    return unwrap<TaskComment>(response.data);
  },
  async attachments(companyId: string, taskId: string): Promise<TaskAttachment[]> {
    if (env.demoMode) return demoDelay(demoTaskAttachments.filter((attachment) => attachment.taskId === taskId));
    const response = await http.get(apiRoutes.tasks.attachments(companyId, taskId));
    return unwrap<TaskAttachment[]>(response.data);
  },
  async attachFile(companyId: string, taskId: string, fileId: string): Promise<TaskAttachment> {
    if (env.demoMode) {
      const attachment: TaskAttachment = { id: makeId('task-attachment'), taskId, fileId, file: demoFiles.find((item) => item.id === fileId), createdAt: new Date().toISOString() };
      demoTaskAttachments.unshift(attachment);
      return demoDelay(attachment);
    }
    const response = await http.post(apiRoutes.tasks.attachments(companyId, taskId), { fileId });
    return unwrap<TaskAttachment>(response.data);
  },
  async removeAttachment(companyId: string, taskId: string, attachmentId: string): Promise<void> {
    if (env.demoMode) {
      const index = demoTaskAttachments.findIndex((item) => item.taskId === taskId && item.id === attachmentId);
      if (index >= 0) demoTaskAttachments.splice(index, 1);
      return demoDelay(undefined);
    }
    await http.delete(apiRoutes.tasks.attachment(companyId, taskId, attachmentId));
  },
  async activityLogs(companyId: string, taskId: string): Promise<TaskActivityLog[]> {
    if (env.demoMode) return demoDelay(demoTaskLogs.filter((log) => log.taskId === taskId));
    const response = await http.get(apiRoutes.tasks.activityLogs(companyId, taskId));
    return unwrap<TaskActivityLog[]>(response.data);
  },
  /**
   * Delegates to filesService rather than posting the multipart body itself.
   * The inline version duplicated the upload logic and, more importantly,
   * skipped filesService's demo-mode branch — so attaching a file in demo mode
   * fired a real network request and failed.
   */
  async uploadAndAttach(companyId: string, taskId: string, file: File): Promise<TaskAttachment> {
    const storedFile = await filesService.upload(companyId, file);
    return tasksService.attachFile(companyId, taskId, storedFile.id);
  },
  async listMine(companyId: string, params?: ListParams): Promise<Task[]> {
    if (env.demoMode) {
      return demoDelay(filterList(demoTasks.filter((t) => t.companyId === companyId && t.assignedToId === demoUser.id), params));
    }
    const response = await http.get(apiRoutes.tasks.myTasks(companyId), { params });
    return unwrap<Array<Task & { taskType?: TaskType }>>(response.data).map(normalizeTask);
  },
};