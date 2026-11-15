/** What a "Snooze for today" on the waiting banner recorded, and when it still applies. See WaitingBanner. */

export interface BannerSnooze {
  /** `id@days` for each late item that was on screen. */
  items: string[];
  /** Set only when more late items may exist beyond the page that was read. */
  total?: number;
}

export function endOfLocalDay(now: Date = new Date()): number {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

/** Whether a stored snooze still covers everything the banner would say now. */
export function snoozeCovers(snooze: BannerSnooze | null, current: BannerSnooze): boolean {
  if (!snooze) return false;
  if (!current.items.every((item) => snooze.items.includes(item))) return false;
  if (current.total !== undefined && current.total > (snooze.total ?? 0)) return false;
  return true;
}
