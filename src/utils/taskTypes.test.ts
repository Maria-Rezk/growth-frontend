import { describe, expect, it } from 'vitest';
import { TASK_TYPE_OPTIONS, readTaskTypes, taskTypeChips, taskTypeLabel, taskTypeSummary } from './taskTypes';

describe('task types', () => {
  it('shows PLAN as "Content" while the value on the wire stays PLAN', () => {
    expect(taskTypeLabel('PLAN')).toBe('Content');
    expect(taskTypeLabel('PLAN', 'ar')).toBe('المحتوى');
    expect(TASK_TYPE_OPTIONS.find((option) => option.label === 'Content')?.value).toBe('PLAN');
    // An existing task stored as PLAN reads as Content.
    expect(taskTypeChips({ taskTypes: ['PLAN', 'DESIGN'], customTaskType: null })).toEqual(['Content', 'Design']);
    expect(TASK_TYPE_OPTIONS.some((option) => option.label === 'Plan')).toBe(false);
  });

  it('shows the typed text for OTHER instead of the word', () => {
    expect(taskTypeChips({ taskTypes: ['REELS', 'OTHER'], customTaskType: 'Event setup' })).toEqual(['Reels', 'Event setup']);
  });

  it('falls back to the word when OTHER has no text', () => {
    expect(taskTypeChips({ taskTypes: ['OTHER'], customTaskType: null })).toEqual(['Other']);
  });

  it('says "No type" for a task with none', () => {
    expect(taskTypeSummary({ taskTypes: [], customTaskType: null })).toBe('No type');
  });

  it('wraps the legacy single taskType, and prefers the list when both arrive', () => {
    expect(readTaskTypes({ taskType: 'DESIGN' })).toEqual(['DESIGN']);
    expect(readTaskTypes({ taskTypes: ['PR'], taskType: 'DESIGN' })).toEqual(['PR']);
    expect(readTaskTypes({})).toEqual([]);
  });
});
