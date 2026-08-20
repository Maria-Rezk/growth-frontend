import { describe, expect, it } from 'vitest';
import { dueBucket, groupByDueBucket } from '@/utils/dueBuckets';

// Fixed instant so the assertions do not depend on when the suite runs.
const NOW = new Date('2026-08-20T14:30:00');

describe('dueBucket', () => {
  it('treats yesterday as overdue', () => {
    expect(dueBucket('2026-08-19T23:59:00', NOW)).toBe('overdue');
  });

  it('treats earlier today as overdue only once the day has passed', () => {
    // 09:00 today is behind `now`, but "due today" is a calendar day, not a
    // 24h window — a task due this morning is still due today, not late.
    expect(dueBucket('2026-08-20T09:00:00', NOW)).toBe('today');
    expect(dueBucket('2026-08-20T23:59:00', NOW)).toBe('today');
  });

  it('covers the next seven days as this week, and beyond as later', () => {
    expect(dueBucket('2026-08-21T08:00:00', NOW)).toBe('week');
    expect(dueBucket('2026-08-26T23:00:00', NOW)).toBe('week');
    expect(dueBucket('2026-08-27T00:00:00', NOW)).toBe('later');
  });

  it('buckets missing and unparseable dates as undated', () => {
    expect(dueBucket(undefined, NOW)).toBe('undated');
    expect(dueBucket(null, NOW)).toBe('undated');
    expect(dueBucket('not a date', NOW)).toBe('undated');
  });
});

describe('groupByDueBucket', () => {
  it('returns every bucket, including the empty ones', () => {
    const groups = groupByDueBucket(
      [{ due: '2026-08-19T10:00:00' }, { due: '2026-08-20T10:00:00' }],
      (item) => item.due,
      NOW,
    );

    expect(groups.overdue).toHaveLength(1);
    expect(groups.today).toHaveLength(1);
    expect(groups.week).toEqual([]);
    expect(groups.later).toEqual([]);
    expect(groups.undated).toEqual([]);
  });
});
