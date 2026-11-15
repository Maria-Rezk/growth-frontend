import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Button } from '@/components/ui/Button';
import { humanize } from '@/utils/format';

/** Cards a column shows before it asks. Enough to work from; few enough that a 400-task client does not render 400 cards. */
const COLUMN_PAGE = 20;

/** What of the column strip is on screen. `null` while it fits: then there is nothing to say and no control to show. */
interface StripState {
  first: number;
  last: number;
  atStart: boolean;
  atEnd: boolean;
}

function readStrip(strip: HTMLElement): StripState | null {
  const max = strip.scrollWidth - strip.clientWidth;
  if (max <= 1) return null;
  // RTL scrolls with a negative scrollLeft; the distance from the start is what matters.
  const offset = Math.abs(strip.scrollLeft);
  const box = strip.getBoundingClientRect();
  const visible: number[] = [];
  Array.from(strip.children).forEach((column, index) => {
    const rect = column.getBoundingClientRect();
    const shown = Math.min(rect.right, box.right) - Math.max(rect.left, box.left);
    if (shown >= rect.width * 0.6) visible.push(index);
  });
  return {
    first: visible.length ? visible[0] : 0,
    last: visible.length ? visible[visible.length - 1] : 0,
    atStart: offset <= 1,
    atEnd: offset >= max - 1,
  };
}

function sameStrip(a: StripState | null, b: StripState | null): boolean {
  if (a === null || b === null) return a === b;
  return a.first === b.first && a.last === b.last && a.atStart === b.atStart && a.atEnd === b.atEnd;
}

export function KanbanBoard<T extends { id: string; status: string }>({
  columns,
  items,
  renderCard,
  emptyText = 'No items in this stage.',
}: {
  columns: string[];
  items: T[];
  renderCard: (item: T) => ReactNode;
  emptyText?: string;
}) {
  /*
    The columns are wider together than the board (six at 272px is 1,692px; a
    desktop board is ~1,130px), so the strip scrolls sideways. Its only scroll
    bar sits at the bottom of the strip, and with a few dozen cards that is
    thousands of pixels below the screen: the last stages could not be reached
    with a mouse wheel, and nothing on a desktop said they were there. So when
    the strip overflows, a bar that stays under the topbar says which stages
    are in view and steps through them, and the edges fade where there is more.
  */
  const stripRef = useRef<HTMLDivElement>(null);
  const [strip, setStrip] = useState<StripState | null>(null);

  const measure = useCallback(() => {
    const element = stripRef.current;
    if (!element) return;
    const next = readStrip(element);
    setStrip((current) => (sameStrip(current, next) ? current : next));
  }, []);

  useEffect(() => {
    const element = stripRef.current;
    if (!element) return undefined;
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    // The strip's own box, and each column: the strip can keep its size while
    // what it holds grows wider, and only the columns would say so.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    Array.from(element.children).forEach((column) => observer?.observe(column));
    window.addEventListener('resize', measure);
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, columns.length]);

  const step = (direction: 1 | -1) => {
    const element = stripRef.current;
    if (!element) return;
    const target = element.children[direction === 1 ? Math.min(columns.length - 1, (strip?.last ?? 0) + 1) : Math.max(0, (strip?.first ?? 0) - 1)] as HTMLElement | undefined;
    if (!target) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Only the strip moves sideways: `scrollIntoView` would also scroll the page to the column's top.
    const box = element.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const delta = direction === 1 ? rect.right - box.right : rect.left - box.left;
    element.scrollBy({ left: delta, behavior: reduce ? 'auto' : 'smooth' });
  };

  const hidden = strip ? columns.length - (strip.last - strip.first + 1) : 0;

  return (
    <div className="kanban-wrap">
      {strip ? (
        <div className="kanban-nav">
          <p className="kanban-nav__status" aria-live="polite">
            {strip.first === strip.last ? `Stage ${strip.first + 1}` : `Stages ${strip.first + 1}–${strip.last + 1}`} of {columns.length}
            <span className="kanban-nav__hint"> · {hidden} more {hidden === 1 ? 'stage' : 'stages'} sideways</span>
          </p>
          <div className="kanban-nav__buttons">
            <Button variant="secondary" size="sm" onClick={() => step(-1)} disabled={strip.atStart} aria-label="Show earlier stages">
              <span aria-hidden="true">←</span> Earlier
            </Button>
            <Button variant="secondary" size="sm" onClick={() => step(1)} disabled={strip.atEnd} aria-label="Show later stages">
              Later <span aria-hidden="true">→</span>
            </Button>
          </div>
        </div>
      ) : null}
      {/* Phones only (CSS): the columns scroll sideways, and nothing else says so. */}
      <p className="board-hint" aria-hidden="true">Swipe sideways for the other {columns.length - 1} stages →</p>
      <div className="kanban-scroller" data-more-start={strip && !strip.atStart ? '' : undefined} data-more-end={strip && !strip.atEnd ? '' : undefined}>
        <div className="kanban" ref={stripRef}>
          {columns.map((column) => (
            <KanbanColumn
              key={column}
              column={column}
              items={items.filter((item) => item.status === column)}
              renderCard={renderCard}
              emptyText={emptyText}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn<T extends { id: string }>({
  column,
  items,
  renderCard,
  emptyText,
}: {
  column: string;
  items: T[];
  renderCard: (item: T) => ReactNode;
  emptyText: string;
}) {
  const [limit, setLimit] = useState(COLUMN_PAGE);
  const visible = items.slice(0, limit);
  const hidden = items.length - visible.length;

  return (
    <div className="kanban-column" role="group" aria-label={`${humanize(column)}, ${items.length}`}>
      <header className="kanban-column__header">
        <StatusBadge value={column} />
        <span>{items.length}</span>
      </header>
      <div className="kanban-column__body">
        {visible.length ? visible.map((item) => <div key={item.id}>{renderCard(item)}</div>) : <p className="kanban-empty">{emptyText}</p>}
        {hidden > 0 ? (
          <Button variant="secondary" size="sm" className="kanban-column__more" onClick={() => setLimit((current) => current + COLUMN_PAGE)}>
            Show {Math.min(hidden, COLUMN_PAGE)} more · {hidden} hidden
          </Button>
        ) : null}
      </div>
    </div>
  );
}
