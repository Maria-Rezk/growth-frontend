import { describe, expect, it } from 'vitest';
import { readTaskTypes, taskTypeChips, taskTypeSummary } from './taskTypes';

describe('task types', () => {
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
