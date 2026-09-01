/**
 * A→Z ordering for the lists of people and clients.
 *
 * `Intl.Collator` rather than `<`: raw string comparison is ASCII order, which
 * puts every lowercase name after every uppercase one ("Zoe" before "acme") and
 * mishandles accented letters. `sensitivity: 'base'` makes it case- and
 * accent-insensitive; `numeric` keeps "Client 2" ahead of "Client 10".
 */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Compares two display labels A→Z. Blank or missing labels sort last. */
export function compareNames(left?: string | null, right?: string | null): number {
  const first = left?.trim() ?? '';
  const second = right?.trim() ?? '';
  if (!first || !second) return (first ? 0 : 1) - (second ? 0 : 1);
  return collator.compare(first, second);
}

/** A copy of `rows` ordered A→Z by `label` — the input array is left untouched. */
export function sortByName<T>(rows: T[], label: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((left, right) => compareNames(label(left), label(right)));
}
