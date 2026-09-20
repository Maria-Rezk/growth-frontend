import clsx from 'clsx';

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={clsx('skeleton', className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <div className="card table-card" aria-busy="true">
      <div className="table-scroll">
        <table className="data-table">
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex}>
                    <Skeleton width={colIndex === 0 ? '70%' : '45%'} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
/**
 * A board in outline while it loads. Columns are the page's own columns, so
 * the real board lands in the same place instead of after a spinner that
 * collapsed the space.
 */
export function BoardSkeleton({ columns, cards = 2 }: { columns: readonly string[]; cards?: number }) {
  return (
    <div className="kanban-wrap" aria-busy="true">
      <div className="kanban">
        {columns.map((column, index) => (
          <section key={column} className="kanban-column">
            <header className="kanban-column__header">
              <Skeleton width={84} height={20} />
              <Skeleton width={16} height={14} />
            </header>
            <div className="kanban-column__body">
              {Array.from({ length: index < 3 ? cards : 1 }).map((_, cardIndex) => (
                <div key={cardIndex} className="kanban-card skeleton-card">
                  <Skeleton width="72%" height={14} />
                  <Skeleton width="100%" height={10} />
                  <Skeleton width="90%" height={10} />
                  <div className="skeleton-row">
                    <Skeleton width={56} height={18} />
                    <Skeleton width={72} height={18} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Stacked rows — My work, notifications, the approval queue. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true">
      <div className="content-card__body">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton-list-row">
            <div className="skeleton-list-row__main">
              <Skeleton width={index % 2 ? '52%' : '68%'} height={14} />
              <Skeleton width="36%" height={10} />
            </div>
            <Skeleton width={72} height={20} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A detail page: title, a main card and the side column, in the detail grid. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <div className="page-header">
        <div>
          <Skeleton width={260} height={24} />
          <Skeleton width={180} height={12} className="skeleton-gap" />
        </div>
      </div>
      <div className="detail-grid">
        <section className="detail-main">
          <div className="card">
            <div className="content-card__body">
              <Skeleton width="90%" height={12} />
              <Skeleton width="75%" height={12} />
              <div className="skeleton-row skeleton-gap">
                <Skeleton width={120} height={44} />
                <Skeleton width={120} height={44} />
                <Skeleton width={120} height={44} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="content-card__body">
              <Skeleton width="60%" height={12} />
              <Skeleton width="80%" height={12} />
            </div>
          </div>
        </section>
        <aside className="detail-side">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="card">
              <div className="content-card__body">
                <Skeleton width="45%" height={14} />
                <Skeleton width="100%" height={32} radius={10} />
              </div>
            </div>
          ))}
        </aside>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
