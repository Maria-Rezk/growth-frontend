import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { humanize } from '@/utils/format';

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
      {columns.map((column) => {
        const columnItems = items.filter((item) => item.status === column);
        return (
          <section key={column} className="kanban-column" aria-label={humanize(column)}>
            <header className="kanban-column__header">
              <StatusBadge value={column} />
              <span>{columnItems.length}</span>
            </header>
            <div className="kanban-column__body">
              {columnItems.length ? columnItems.map((item) => <div key={item.id}>{renderCard(item)}</div>) : <p className="kanban-empty">{emptyText}</p>}
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}
