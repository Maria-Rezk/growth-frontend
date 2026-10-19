import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { getAllItems } from '@/lib/paging';
import {
  demoDelay,
  demoMemberUser,
  demoTaskComments,
  demoTaskLogs,
  demoTasks,
  demoUser,
  filterList,
  makeId,
  moveTaskStatus,
  pushNotification,
} from '@/services/demoStore';
import { attachmentFieldsForWire, attachmentsService, type AttachmentCreateFields } from '@/services/attachments';
import type {
  ApproverResolution,
  ListParams,
  Paginated,
  Task,
  TaskActivityLog,
  TaskComment,
  TaskStatus,
  TaskType,
} from '@/types/domain';
import { TaskReviewErrorCode, TaskType as TaskTypeValue } from '@/types/domain';
import { readTaskTypes } from '@/utils/taskTypes';

/** Files are uploaded on selection and attached in the same transaction as the create. Files, links and notes together: max 20. */
export type TaskCreatePayload = Partial<Task> & AttachmentCreateFields & {
  relatedEntityType?: string;
  relatedEntityId?: string;
  notes?: string;
};

/**
 * `OTHER` needs its text and every other selection must not carry any: the
 * backend clears a leftover on its own, but sending it would be a lie on the wire.
 */
function typeFields(taskTypes: TaskType[] | undefined, customTaskType: string | null | undefined) {
  if (!taskTypes) return {};
  const hasOther = taskTypes.includes(TaskTypeValue.OTHER);
  return { taskTypes, customTaskType: hasOther ? customTaskType?.trim() || undefined : undefined };
}

/** List filters as the API spells them: `type` is `taskType` on the wire, and drafts are a flag. */
function wireParams(params?: ListParams): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const { type, drafts, ...rest } = params;
  return { ...rest, ...(type ? { taskType: type } : {}), ...(drafts ? { drafts: true } : {}) };
}

/** Demo-only: the same sequence rules the API enforces on create and update. */
function demoCheckSequence(companyId: string, taskId: string | null, relatedEntityType?: string, relatedEntityId?: string, sequence?: number | null) {
  if (sequence === undefined || sequence === null) return;
  if (relatedEntityType !== 'POST' || !relatedEntityId) {
    throw demoReviewError(422, TaskReviewErrorCode.SEQUENCE_NEEDS_POST, 'A stage number only applies to a task on a post.');
  }
  const holder = demoTasks.find((task) => task.companyId === companyId && task.id !== taskId
    && task.relatedEntityType === 'POST' && task.relatedEntityId === relatedEntityId && task.sequence === sequence);
  if (holder) throw demoReviewError(409, TaskReviewErrorCode.SEQUENCE_TAKEN, `Stage ${sequence} on this post is already taken by "${holder.title}".`);
}

/** Demo-only: earlier stages on the same post still open. */
function demoOpenEarlierStages(task: Task): Task[] {
  if (task.relatedEntityType !== 'POST' || !task.sequence) return [];
  return demoTasks.filter((other) => other.id !== task.id && other.relatedEntityType === 'POST'
    && other.relatedEntityId === task.relatedEntityId && typeof other.sequence === 'number'
    && other.sequence < (task.sequence ?? 0) && other.status !== 'DONE' && other.status !== 'CANCELED');
}

/*
  The API sends `taskTypes`. A backend that has not shipped it yet sends the
  single `taskType`; wrap it so the rest of the app only ever reads the list.
*/
type WireTask = Task & { taskType?: TaskType };

function normalizeTask(raw: WireTask): Task {
  const { taskType: _legacy, ...task } = raw;
  return {
    ...task,
    taskTypes: readTaskTypes(raw),
    customTaskType: raw.customTaskType ?? null,
    isDraft: raw.isDraft ?? false,
    startedAt: raw.startedAt ?? null,
  };
}

function demoDraftError(): Error & { statusCode: number; code: string } {
  return demoReviewError(409, TaskReviewErrorCode.TASK_IS_DRAFT, 'This task is still a draft. Publish it first.');
}

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

/*
  Task comments on the wire use `comment` for the text and `userId` for the
  author, sometimes with the user embedded as `user` — the same drift the
  post comments have. Normalised here so the page reads `body` and `author`
  and never has to know which spelling arrived.
*/
type RawTaskComment = Partial<TaskComment> & {
  id: string;
  taskId?: string;
  comment?: string;
  userId?: string;
  user?: TaskComment['author'];
  createdBy?: TaskComment['author'];
};

export function normalizeTaskComment(raw: RawTaskComment, taskId: string): TaskComment {
  return {
    id: raw.id,
    taskId: raw.taskId ?? taskId,
    body: raw.body ?? raw.comment ?? '',
    authorId: raw.authorId ?? raw.userId ?? raw.author?.id ?? raw.user?.id ?? raw.createdBy?.id,
    author: raw.author ?? raw.user ?? raw.createdBy,
    createdAt: raw.createdAt,
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
    if (env.demoMode) return demoDelay(filterList(demoTasks.filter((task) => task.companyId === companyId && !task.isDraft), params));
    return (await getAllItems<WireTask>(apiRoutes.tasks.list(companyId), wireParams(params))).map(normalizeTask);
  },
  /** The caller's own drafts. Nobody else's are ever listed. */
  async listDrafts(companyId: string): Promise<Task[]> {
    if (env.demoMode) return demoDelay(demoTasks.filter((task) => task.companyId === companyId && task.isDraft && task.createdById === demoUser.id));
    return (await getAllItems<WireTask>(apiRoutes.tasks.list(companyId), wireParams({ drafts: true }))).map(normalizeTask);
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
  async create(companyId: string, payload: TaskCreatePayload): Promise<Task> {
    if (env.demoMode) {
      demoCheckSequence(companyId, null, payload.relatedEntityType, payload.relatedEntityId, payload.sequence);
      const task: Task = {
        id: makeId('task'),
        companyId,
        title: payload.title ?? 'Untitled task',
        description: payload.description,
        status: payload.status ?? 'TODO',
        priority: payload.priority ?? 'MEDIUM',
        taskTypes: payload.taskTypes ?? [],
        customTaskType: payload.taskTypes?.includes(TaskTypeValue.OTHER) ? payload.customTaskType?.trim() || null : null,
        isDraft: payload.isDraft ?? false,
        startedAt: null,
        createdById: demoUser.id,
        assignedToId: payload.assignedToId,
        assignedTo: payload.assignedTo,
        approverId: payload.approverId ?? null,
        approver: payload.approverId ? demoMemberUser(payload.approverId) : null,
        submittedForReviewAt: null,
        reviewedAt: null,
        reviewNote: null,
        relatedEntityType: payload.relatedEntityType,
        relatedEntityId: payload.relatedEntityId,
        sequence: payload.sequence ?? null,
        dueDate: payload.dueDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (payload.taskTypes?.includes(TaskTypeValue.OTHER) && !task.customTaskType) {
        throw demoReviewError(422, TaskReviewErrorCode.CUSTOM_TASK_TYPE_REQUIRED, 'Say what the other type of work is: customTaskType is required with OTHER');
      }
      demoTasks.unshift(task);
      await attachmentsService.addAllDemo(companyId, { entityType: 'TASK', entityId: task.id }, payload);
      demoTaskLogs.unshift({ id: makeId('task-log'), taskId: task.id, action: 'TASK_CREATED', createdAt: new Date().toISOString() });
      // A draft tells nobody anything until it is published.
      if (!task.isDraft) pushNotification({ type: 'TASK_ASSIGNED', title: 'Task created', message: task.title, readAt: null, relatedEntityType: 'TASK', relatedEntityId: task.id });
      return demoDelay(task);
    }
    const body = {
      title: payload.title,
      description: payload.description,
      ...typeFields(payload.taskTypes, payload.customTaskType),
      // Only ever sent as true: a published task is the default.
      isDraft: payload.isDraft ? true : undefined,
      priority: payload.priority,
      dueDate: payload.dueDate,
      assignedToId: payload.assignedToId,
      // Optional. Omitted, the backend reads the responsibility matrix; sent,
      // it must be an active member of this client (422 APPROVER_REQUIRED).
      approverId: payload.approverId || undefined,
      relatedEntityType: payload.relatedEntityType,
      relatedEntityId: payload.relatedEntityId,
      // 422 SEQUENCE_NEEDS_POST without a POST parent, so never send it otherwise.
      sequence: payload.relatedEntityType === 'POST' && payload.sequence ? payload.sequence : undefined,
      notes: payload.notes,
      ...attachmentFieldsForWire(payload),
      // no status — backend assigns the initial status
    };

    const response = await http.post(apiRoutes.tasks.list(companyId), body);
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
  },
  async update(companyId: string, taskId: string, payload: Partial<Task>): Promise<Task> {
    if (env.demoMode) {
      const task = demoTasks.find((item) => item.companyId === companyId && item.id === taskId);
      if (!task) throw new Error('Task not found.');
      if ('sequence' in payload) demoCheckSequence(companyId, taskId, task.relatedEntityType, task.relatedEntityId, payload.sequence);
      if ('approverId' in payload && payload.approverId !== task.approverId) {
        demoLog(taskId, 'TASK_APPROVER_CHANGED', { from: task.approverId ?? null, to: payload.approverId ?? null });
        task.approver = payload.approverId ? demoMemberUser(payload.approverId) : null;
      }
      Object.assign(task, payload, { updatedAt: new Date().toISOString() });
      if (payload.taskTypes && !payload.taskTypes.includes(TaskTypeValue.OTHER)) task.customTaskType = null;
      return demoDelay(task);
    }
    // `isDraft` cannot be changed here — publishing goes through `publishDraft`, which is what notifies the assignee.
    const { isDraft: _isDraft, taskTypes, customTaskType, ...rest } = payload;
    const response = await http.patch(apiRoutes.tasks.detail(companyId, taskId), { ...rest, ...typeFields(taskTypes, customTaskType) });
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
  },
  async setStatus(companyId: string, taskId: string, status: TaskStatus, note?: string): Promise<Task> {
    if (env.demoMode) {
      const before = demoTask(companyId, taskId);
      if (before.isDraft) throw demoDraftError();
      if (status === 'IN_REVIEW' || (before.status === 'IN_REVIEW' && status !== 'CANCELED')) {
        throw demoReviewError(409, TaskReviewErrorCode.REVIEW_ACTIONS_ONLY, 'IN_REVIEW is managed by the review actions. Use submit-for-review, approve or request-changes.');
      }
      const firstStart = status === 'IN_PROGRESS' && !before.startedAt;
      const task = moveTaskStatus(taskId, status);
      if (status === 'CANCELED') task.submittedForReviewAt = null;
      // The first start goes to the supervisor (the approver when nobody supervises), never to the person who pressed it.
      if (firstStart) {
        pushNotification({
          type: 'TASK_STARTED',
          title: 'Work has started',
          message: `${demoUser.fullName} started working on "${task.title}"`,
          readAt: null,
          relatedEntityType: 'TASK',
          relatedEntityId: taskId,
          metadata: { startedAt: task.startedAt, startedById: demoUser.id, assignedToId: task.assignedToId, taskTypes: task.taskTypes, notifiedAs: 'SUPERVISOR' },
        });
      }
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
      if (task.isDraft) throw demoDraftError();
      if (!task.approverId) throw demoReviewError(422, TaskReviewErrorCode.APPROVER_REQUIRED, 'This task has no approver. Set one before submitting it for review.');
      if (task.status !== 'TODO' && task.status !== 'IN_PROGRESS') {
        throw demoReviewError(409, TaskReviewErrorCode.INVALID_TRANSITION, `A task in ${task.status} cannot take the action submit-for-review`);
      }
      const earlier = demoOpenEarlierStages(task);
      if (earlier.length) {
        throw Object.assign(
          demoReviewError(409, TaskReviewErrorCode.PREVIOUS_STAGE_OPEN, `An earlier stage on this post is still open: ${earlier[0].title}`),
          { openTaskIds: earlier.map((item) => item.id) },
        );
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
  async resolveApprover(companyId: string, taskTypes: TaskType[]): Promise<ApproverResolution> {
    if (env.demoMode) {
      const mapped = taskTypes.filter((type) => type !== TaskTypeValue.OTHER);
      const resolved = mapped.length > 0;
      return demoDelay({
        taskTypes,
        approverId: resolved ? demoUser.id : null,
        reason: resolved ? 'RESOLVED' : 'UNMAPPED_TASK_TYPE',
        areas: mapped.map((taskType) => ({ taskType, areaId: 'demo-area-1', areaName: 'Social Media', userIds: [demoUser.id] })),
        candidateUserIds: resolved ? [demoUser.id] : [],
      });
    }
    // Comma-separated; the API also accepts the key repeated.
    const response = await http.get(apiRoutes.tasks.resolveApprover(companyId), { params: { taskTypes: taskTypes.join(',') } });
    const data = unwrap<Partial<ApproverResolution>>(response.data) ?? {};
    return {
      taskTypes,
      approverId: data.approverId ?? null,
      reason: data.reason ?? 'NO_MATCHING_AREA',
      areas: Array.isArray(data.areas) ? data.areas : [],
      candidateUserIds: Array.isArray(data.candidateUserIds) ? data.candidateUserIds : [],
    };
  },
  /**
   * Issue a draft: it joins the lists, the assignee is told, and the matrix is
   * asked again for an approver if none was set.
   */
  async publishDraft(companyId: string, taskId: string): Promise<Task> {
    if (env.demoMode) {
      const task = demoTask(companyId, taskId);
      if (!task.isDraft) throw demoReviewError(409, TaskReviewErrorCode.NOT_A_DRAFT, 'This task has already been published');
      task.isDraft = false;
      pushNotification({ type: 'TASK_ASSIGNED', title: 'Task created', message: task.title, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(task);
    }
    const response = await http.post(apiRoutes.tasks.publishDraft(companyId, taskId));
    return normalizeTask(unwrap<WireTask>(response.data));
  },
  /** Drafts only; an issued task answers 409 NOT_A_DRAFT — cancel it instead. */
  async discardDraft(companyId: string, taskId: string): Promise<void> {
    if (env.demoMode) {
      const task = demoTask(companyId, taskId);
      if (!task.isDraft) throw demoReviewError(409, TaskReviewErrorCode.NOT_A_DRAFT, 'This task has already been published');
      demoTasks.splice(demoTasks.indexOf(task), 1);
      return demoDelay(undefined);
    }
    await http.delete(apiRoutes.tasks.detail(companyId, taskId));
  },
  async comments(companyId: string, taskId: string): Promise<TaskComment[]> {
    if (env.demoMode) return demoDelay(demoTaskComments.filter((comment) => comment.taskId === taskId));
    const response = await http.get(apiRoutes.tasks.comments(companyId, taskId));
    const raw = unwrap<RawTaskComment[]>(response.data);
    return (Array.isArray(raw) ? raw : []).map((item) => normalizeTaskComment(item, taskId));
  },
  async addComment(companyId: string, taskId: string, body: string): Promise<TaskComment> {
    if (env.demoMode) {
      const comment: TaskComment = { id: makeId('task-comment'), taskId, body, authorId: demoUser.id, author: demoUser, createdAt: new Date().toISOString() };
      demoTaskComments.unshift(comment);
      pushNotification({ type: 'TASK_COMMENTED', title: 'New task comment', message: body, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(comment);
    }
    const response = await http.post(apiRoutes.tasks.comments(companyId, taskId), { comment: body });
    return normalizeTaskComment(unwrap<RawTaskComment>(response.data), taskId);
  },
  async activityLogs(companyId: string, taskId: string): Promise<TaskActivityLog[]> {
    if (env.demoMode) return demoDelay(demoTaskLogs.filter((log) => log.taskId === taskId));
    const response = await http.get(apiRoutes.tasks.activityLogs(companyId, taskId));
    return unwrap<TaskActivityLog[]>(response.data);
  },
  async listMine(companyId: string, params?: ListParams): Promise<Task[]> {
    if (env.demoMode) {
      return demoDelay(filterList(demoTasks.filter((t) => t.companyId === companyId && t.assignedToId === demoUser.id), params));
    }
    const response = await http.get(apiRoutes.tasks.myTasks(companyId), { params });
    return unwrap<Array<Task & { taskType?: TaskType }>>(response.data).map(normalizeTask);
  },
};