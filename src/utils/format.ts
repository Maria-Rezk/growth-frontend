/*
  Dates follow the app's language, not the operating system's. `LocaleProvider`
  writes the chosen language onto <html lang>, so reading it here keeps the
  formatter in step with the toggle without threading a locale through every
  call. Undefined (no document — tests, SSR) falls back to the runtime default.
*/
function appLocale(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const lang = document.documentElement.lang;
  return lang === 'ar' ? 'ar-EG' : lang || undefined;
}

export function humanize(value?: string | null): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(appLocale(), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(appLocale(), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPercent(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100) / 100}%`;
}

export function toInputDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

export function fromInputDateTime(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Formats a ratio from the API as a percentage: `0.21` → `21%`.
 *
 * Distinct from `formatPercent`, which takes a value that is already a
 * percentage. The admin dashboard's `conversionRate` is a ratio, and it is
 * filtered differently from the counts beside it — format it, never recompute
 * it from `won / (won + lost)`.
 */
export function formatRatioPercent(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 1000) / 10}%`;
}

/** `1536` → `1.5 KB`. Empty for an unknown size rather than "0 B". */
export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Minutes of age as a compact duration: `1280` → `21h`, `4300` → `2d 23h`. */
export function formatAgeMinutes(minutes?: number | null): string {
  if (minutes === undefined || minutes === null || Number.isNaN(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

/** Hours as a compact duration: `49` → `2d 1h`, `18.4` → `18h`. */
export function formatHours(hours?: number | null): string {
  if (hours === undefined || hours === null || Number.isNaN(hours)) return '—';
  return formatAgeMinutes(hours * 60);
}
