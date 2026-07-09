import { formatDateTime, humanize } from '@/utils/format';

export function Timeline({
  items,
  empty = 'No activity yet.',
}: {
  items: Array<{ id: string; title?: string; body?: string; action?: string; createdAt?: string }>;
  empty?: string;
}) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id} className="timeline__item">
          <span className="timeline__dot" />
          <div>
            <p className="timeline__title">{item.title ?? humanize(item.action)}</p>
            {item.body ? <p className="muted">{item.body}</p> : null}
            <time className="timeline__time">{formatDateTime(item.createdAt)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
