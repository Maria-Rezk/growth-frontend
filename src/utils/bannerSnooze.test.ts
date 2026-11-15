import { describe, expect, it } from 'vitest';
import { endOfLocalDay, snoozeCovers } from './bannerSnooze';

describe('snoozeCovers', () => {
  const snooze = { items: ['task-1@1', 'task-2@3'] };

  it('covers the same items, or fewer (one was dealt with)', () => {
    expect(snoozeCovers(snooze, { items: ['task-1@1', 'task-2@3'] })).toBe(true);
    expect(snoozeCovers(snooze, { items: ['task-2@3'] })).toBe(true);
  });

  it('does not cover a newly late item', () => {
    expect(snoozeCovers(snooze, { items: ['task-1@1', 'task-2@3', 'task-9@1'] })).toBe(false);
  });

  it('does not cover an item that has waited into another day', () => {
    expect(snoozeCovers(snooze, { items: ['task-1@2', 'task-2@3'] })).toBe(false);
  });

  it('does not cover growth beyond the page that was read', () => {
    expect(snoozeCovers({ ...snooze, total: 30 }, { ...snooze, total: 30 })).toBe(true);
    expect(snoozeCovers({ ...snooze, total: 30 }, { ...snooze, total: 31 })).toBe(false);
    // Recorded without a total (the page was not full), now there are more beyond it.
    expect(snoozeCovers(snooze, { ...snooze, total: 26 })).toBe(false);
  });

  it('covers nothing without a snooze', () => {
    expect(snoozeCovers(null, { items: ['task-1@1'] })).toBe(false);
  });
});

describe('endOfLocalDay', () => {
  it('is the coming local midnight', () => {
    const end = new Date(endOfLocalDay(new Date(2026, 9, 29, 13, 45)));
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([2026, 9, 30, 0, 0]);
  });

  it('from just before midnight, is a minute away', () => {
    const now = new Date(2026, 9, 29, 23, 59);
    expect(endOfLocalDay(now) - now.getTime()).toBe(60_000);
  });
});
