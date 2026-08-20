/**
 * Due-date bucketing for "My work".
 *
 * The employee screen is organised by *when work is due*, not by which client
 * it belongs to — the client is a tag on the row. Buckets are computed from
 * local calendar days (not 24h offsets) so "due today" means today on the
 * user's calendar, which is what the word means to them.
 */
export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'undated';

/** Display order. Overdue first: it is the only bucket that is already late. */
export const DUE_BUCKETS: readonly DueBucket[] = ['overdue', 'today', 'week', 'later', 'undated'] as const;

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'This week',
  later: 'Later',
  undated: 'No due date',
};

export const DUE_BUCKET_HINTS: Record<DueBucket, string> = {
  overdue: 'Past its due date and still open.',
  today: 'Due before the end of today.',
  week: 'Due within the next seven days.',
  later: 'Scheduled further out.',
  undated: 'Nobody has committed to a date yet.',
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * `now` is injectable so this is testable and so a single render bucket-sorts
 * every row against the same instant.
 */
export function dueBucket(dueDate?: string | null, now: Date = new Date()): DueBucket {
  if (!dueDate) return 'undated';
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'undated';

  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const weekEnd = addDays(todayStart, 7);

  if (due < todayStart) return 'overdue';
  if (due < tomorrowStart) return 'today';
  if (due < weekEnd) return 'week';
  return 'later';
}

/**
 * Groups into every bucket, including empty ones — the caller decides whether
 * to render an empty section, and always gets a defined array per key.
 */
export function groupByDueBucket<T>(
  items: T[],
  getDueDate: (item: T) => string | undefined | null,
  now: Date = new Date(),
): Record<DueBucket, T[]> {
  const groups = {
    overdue: [] as T[],
    today: [] as T[],
    week: [] as T[],
    later: [] as T[],
    undated: [] as T[],
  };
  items.forEach((item) => {
    groups[dueBucket(getDueDate(item), now)].push(item);
  });
  return groups;
}

/** Earliest due date first; undated rows sort last. */
export function byDueDateAscending(a?: string | null, b?: string | null): number {
  const left = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
  const right = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
  return left - right;
}
