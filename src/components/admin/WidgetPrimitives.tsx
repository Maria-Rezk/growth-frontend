import type { ReactNode } from 'react';

/**
 * A labelled count bar per status.
 *
 * Bars are scaled to the largest value in the set, not to a total — these are
 * pipeline stages, and one dominant "PUBLISHED" bucket would otherwise flatten
 * every stage that matters into an invisible sliver.
 */
export function StatBars({
  counts,
  order,
  highlight,
}: {
  counts: Record<string, number>;
  /** Preferred display order. Keys not listed are appended in server order. */
  order: readonly string[];
  /** Statuses to mark as needing action. */
  highlight?: readonly string[];
}) {
  // `counts` is required by the contract but absent from some backend
  // examples; an unguarded Object.keys here would take the whole card down.
  const safeCounts = counts ?? {};
  const keys = [
    ...order.filter((key) => key in safeCounts),
    ...Object.keys(safeCounts).filter((key) => !order.includes(key)),
  ];
  const max = Math.max(1, ...keys.map((key) => safeCounts[key] ?? 0));
  const highlighted = new Set(highlight ?? []);

  return (
    <ul className="stat-bars">
      {keys.map((key) => {
        const value = safeCounts[key] ?? 0;
        return (
          <li key={key} className={highlighted.has(key) ? 'stat-bar stat-bar--attention' : 'stat-bar'}>
            <span className="stat-bar__label">{label(key)}</span>
            <span className="stat-bar__track" aria-hidden="true">
              <span className="stat-bar__fill" style={{ width: `${(value / max) * 100}%` }} />
            </span>
            <span className="stat-bar__value">{value}</span>
          </li>
        );
      })}
    </ul>
  );
}

function label(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** A compact row of label/value pairs under a chart. */
export function StatStrip({ children }: { children: ReactNode }) {
  return <dl className="stat-strip">{children}</dl>;
}

export function Stat({
  label: text,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: 'warning' | 'success' | 'info';
  hint?: string;
}) {
  return (
    <div className={tone ? `stat stat--${tone}` : 'stat'} title={hint}>
      <dt>{text}</dt>
      <dd>{value}</dd>
    </div>
  );
}
