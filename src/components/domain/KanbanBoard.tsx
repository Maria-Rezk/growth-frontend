import { useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Button } from '@/components/ui/Button';
import { humanize } from '@/utils/format';

/** Cards a column shows before it asks. Enough to work from; few enough that a 400-task client does not render 400 cards. */
const COLUMN_PAGE = 20;

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
  return (
    <div className="kanban-wrap">
      {/* Phones only (CSS): the columns scroll sideways, and nothing else says so. */}
      <p className="board-hint" aria-hidden="true">Swipe sideways for the other {columns.length - 1} stages →</p>
      <div className="kanban" role="list">
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
    <section className="kanban-column" aria-label={humanize(column)}>
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
    </section>
  );
}
