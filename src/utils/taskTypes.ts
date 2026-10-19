import { TaskType, type Task } from '@/types/domain';

export const TASK_TYPE_OPTIONS: ReadonlyArray<{ value: TaskType; label: string; labelAr: string }> = [
  { value: TaskType.PLAN, label: 'Plan', labelAr: 'الخطة' },
  { value: TaskType.DESIGN, label: 'Design', labelAr: 'التصميم' },
  { value: TaskType.CAPTIONS, label: 'Captions', labelAr: 'الكابشن' },
  { value: TaskType.REELS, label: 'Reels', labelAr: 'الريلز' },
  { value: TaskType.PHOTO_SHOOT, label: 'Photo Shoot', labelAr: 'التصوير' },
  { value: TaskType.IT, label: 'IT', labelAr: 'تقنية المعلومات' },
  { value: TaskType.OPERATIONS, label: 'Operations', labelAr: 'العمليات' },
  { value: TaskType.PR, label: 'PR', labelAr: 'العلاقات العامة' },
  { value: TaskType.OTHER, label: 'Other', labelAr: 'أخرى' },
];

const LABELS = new Map(TASK_TYPE_OPTIONS.map((option) => [option.value, option]));

export function taskTypeLabel(type: TaskType, lang: 'en' | 'ar' = 'en'): string {
  const option = LABELS.get(type);
  if (!option) return type;
  return lang === 'ar' ? option.labelAr : option.label;
}

/** The types a task carries. A response that predates the field yields none. */
export function typesOf(task: Pick<Task, 'taskTypes'>): TaskType[] {
  return Array.isArray(task.taskTypes) ? task.taskTypes : [];
}

/**
 * One label per type, in the order the task lists them. `OTHER` reads as the
 * text the user typed, not the word "Other"; with nothing typed it falls back
 * to the word so the chip is never blank.
 */
export function taskTypeChips(task: Pick<Task, 'taskTypes' | 'customTaskType'>): string[] {
  return typesOf(task).map((type) => (type === TaskType.OTHER && task.customTaskType?.trim() ? task.customTaskType.trim() : taskTypeLabel(type)));
}

/** "Reels, Photo Shoot, Event setup" — or "No type" for a task with none. */
export function taskTypeSummary(task: Pick<Task, 'taskTypes' | 'customTaskType'>): string {
  const chips = taskTypeChips(task);
  return chips.length ? chips.join(', ') : 'No type';
}

/**
 * Reads a task off the wire. `taskTypes` is the contract; a response from a
 * backend that has not shipped it yet still carries the single `taskType`,
 * which is wrapped rather than shown as "no type".
 */
export function readTaskTypes(raw: { taskTypes?: unknown; taskType?: unknown; type?: unknown }): TaskType[] {
  if (Array.isArray(raw.taskTypes)) return raw.taskTypes as TaskType[];
  const single = raw.taskType ?? raw.type;
  return typeof single === 'string' && single ? [single as TaskType] : [];
}
