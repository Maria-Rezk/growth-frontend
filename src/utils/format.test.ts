import { describe, expect, it } from 'vitest';
import { fromInputDateTime, humanize, toInputDateTime } from './format';

describe('humanize', () => {
  it('turns constants into words', () => {
    expect(humanize('IN_PROGRESS')).toBe('In Progress');
    expect(humanize('instagram')).toBe('Instagram');
  });

  it('leaves text somebody typed exactly as written', () => {
    expect(humanize('Instagram DM')).toBe('Instagram DM');
    expect(humanize('LinkedIn')).toBe('LinkedIn');
  });

  it('shows a dash for nothing', () => {
    expect(humanize(null)).toBe('—');
    expect(humanize('')).toBe('—');
  });
});

describe('datetime-local round trip', () => {
  it('reading back what was saved gives the same wall-clock time, in any time zone', () => {
    const typed = '2026-11-05T10:30';
    expect(toInputDateTime(fromInputDateTime(typed))).toBe(typed);
  });

  it('a second save does not move the time again', () => {
    const once = fromInputDateTime('2026-03-29T01:15');
    const twice = fromInputDateTime(toInputDateTime(once));
    expect(twice).toBe(once);
  });

  it('formats an instant in local time', () => {
    const date = new Date(2026, 0, 2, 3, 4);
    expect(toInputDateTime(date.toISOString())).toBe('2026-01-02T03:04');
  });

  it('is empty for nothing or garbage', () => {
    expect(toInputDateTime(undefined)).toBe('');
    expect(toInputDateTime('not a date')).toBe('');
  });
});
