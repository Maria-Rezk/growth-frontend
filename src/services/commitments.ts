import type { ReportOverview } from '@/types/domain';

/**
 * What we promised a client each month, so a report can answer "are we
 * behind?" instead of only "what happened?".
 *
 * A count of what was delivered is not a measure of delivery — it is only
 * half of one. Twelve posts is good against a commitment of ten and bad
 * against a commitment of twenty, and today the system has no idea which.
 *
 * STORAGE: this lives in `localStorage`, deliberately and temporarily. The
 * commitment belongs on the client record in the API (one number per
 * deliverable, set when the contract is signed); until that field exists the
 * value is per browser and does not follow the user to another machine. The
 * UI says so. Everything else here — the comparison, the pacing, the verdict
 * — is independent of where the number is stored, so moving it to the API is
 * a change to these three functions and nothing else.
 */
export interface MonthlyCommitment {
  posts: number;
  reels: number;
  stories: number;
  carousels: number;
  reports: number;
}

export type CommitmentKey = keyof MonthlyCommitment;

export const EMPTY_COMMITMENT: MonthlyCommitment = {
  posts: 0,
  reels: 0,
  stories: 0,
  carousels: 0,
  reports: 0,
};

export const COMMITMENT_ITEMS: Array<{ key: CommitmentKey; label: string; hint: string }> = [
  { key: 'posts', label: 'Posts', hint: 'Every content post in the period, any format.' },
  { key: 'reels', label: 'Reels', hint: 'Posts whose content type is a reel.' },
  { key: 'stories', label: 'Stories', hint: 'Posts whose content type is a story.' },
  { key: 'carousels', label: 'Carousels', hint: 'Posts whose content type is a carousel.' },
  { key: 'reports', label: 'Monthly report', hint: 'Reports generated for this period.' },
];

const STORAGE_KEY = 'growth.commitments';

type CommitmentStore = Record<string, Partial<MonthlyCommitment>>;

function readStore(): CommitmentStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as CommitmentStore) : {};
  } catch {
    // Corrupt or unavailable storage must not take the reports page down.
    return {};
  }
}

function writeStore(store: CommitmentStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* Private mode / quota — the page keeps working without persistence. */
  }
}

function coerce(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export const commitmentsService = {
  /** Never null: an unset commitment is all zeroes, which renders as "not set". */
  get(companyId: string): MonthlyCommitment {
    const stored = readStore()[companyId] ?? {};
    return {
      posts: coerce(stored.posts),
      reels: coerce(stored.reels),
      stories: coerce(stored.stories),
      carousels: coerce(stored.carousels),
      reports: coerce(stored.reports),
    };
  },

  save(companyId: string, commitment: MonthlyCommitment): MonthlyCommitment {
    const store = readStore();
    const clean: MonthlyCommitment = {
      posts: coerce(commitment.posts),
      reels: coerce(commitment.reels),
      stories: coerce(commitment.stories),
      carousels: coerce(commitment.carousels),
      reports: coerce(commitment.reports),
    };
    store[companyId] = clean;
    writeStore(store);
    return clean;
  },

  clear(companyId: string): void {
    const store = readStore();
    delete store[companyId];
    writeStore(store);
  },
};

export function isCommitmentSet(commitment: MonthlyCommitment): boolean {
  return COMMITMENT_ITEMS.some((item) => commitment[item.key] > 0);
}

/*
  Content types arrive as free-ish strings — the create form sends `REEL`,
  older/seeded records carry `Reel` or `Static Post`. Match on a normalized
  token rather than on equality so both shapes count.
*/
function countContentType(overview: ReportOverview | null | undefined, token: string): number {
  const byType = overview?.postsByContentType;
  if (!byType) return 0;
  return Object.entries(byType).reduce((total, [key, value]) => {
    const normalized = key.toUpperCase().replace(/[^A-Z]/g, '');
    return normalized.includes(token) ? total + (value ?? 0) : total;
  }, 0);
}

/** What was actually delivered for one commitment line in this period. */
export function deliveredFor(
  key: CommitmentKey,
  overview: ReportOverview | null | undefined,
  reportsInPeriod: number,
): number {
  switch (key) {
    case 'posts':
      return overview?.postsTotal ?? 0;
    case 'reels':
      return countContentType(overview, 'REEL');
    case 'stories':
      return countContentType(overview, 'STORY');
    case 'carousels':
      return countContentType(overview, 'CAROUSEL');
    case 'reports':
      return reportsInPeriod;
  }
}

/**
 * How much of the month has elapsed, as a 0–1 fraction.
 *
 * A past month is fully elapsed (1) and a future one has not started (0) —
 * otherwise a report for last March would claim the team is "behind pace"
 * forever, and next month's plan would show as already failing.
 */
export function monthProgress(month: number, year: number, now: Date = new Date()): number {
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  if (year < currentYear || (year === currentYear && month < currentMonth)) return 1;
  if (year > currentYear || (year === currentYear && month > currentMonth)) return 0;

  const daysInMonth = new Date(year, month, 0).getDate();
  return now.getDate() / daysInMonth;
}

export type CommitmentState = 'complete' | 'behind' | 'on-track' | 'not-started';

export function commitmentState(target: number, delivered: number, progress: number): CommitmentState {
  if (delivered >= target) return 'complete';
  if (delivered === 0 && progress > 0) return 'not-started';
  return delivered < target * progress ? 'behind' : 'on-track';
}
