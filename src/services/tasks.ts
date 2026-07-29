import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import {
  demoDelay,
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
  ListParams,
  Task,
  TaskActivityLog,
  TaskAttachment,
  TaskComment,
  TaskStatus,
  TaskType,
} from '@/types/domain';

// The backend read model returns `taskType`, but the app reads `task.type`.
// Normalize inbound so the wire difference stays isolated in this service.
function normalizeTask(raw: Task & { taskType?: TaskType }): Task {
  return { ...raw, type: raw.type ?? raw.taskType ?? 'GENERAL' };
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
      Object.assign(task, payload, { updatedAt: new Date().toISOString() });
      return demoDelay(task);
    }
    const response = await http.patch(apiRoutes.tasks.detail(companyId, taskId), payload);
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
  },
  async setStatus(companyId: string, taskId: string, status: TaskStatus, note?: string): Promise<Task> {
    if (env.demoMode) {
      const task = moveTaskStatus(taskId, status);
      pushNotification({ type: 'TASK_STATUS_CHANGED', title: 'Task status changed', message: `${task.title} moved to ${status}`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: taskId });
      return demoDelay(task);
    }
    const response = await http.patch(apiRoutes.tasks.status(companyId, taskId), { status, note });
    return normalizeTask(unwrap<Task & { taskType?: TaskType }>(response.data));
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
      const attachment: TaskAttachment = { id: makeId('task-attachment'), taskId, fileId, createdAt: new Date().toISOString() };
      demoTaskAttachments.unshift(attachment);
      return demoDelay(attachment);
    }
    const response = await http.post(apiRoutes.tasks.attachments(companyId, taskId), { fileId });
    return unwrap<TaskAttachment>(response.data);
  },
  async removeAttachment(companyId: string, taskId: string, attachmentId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
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