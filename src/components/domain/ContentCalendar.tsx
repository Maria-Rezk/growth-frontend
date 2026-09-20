import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { appRoutes } from '@/config/appRoutes';
import { PostStatus, type ContentPost } from '@/types/domain';
import { humanize } from '@/utils/format';

/*
  Status → the colour a calendar chip takes. Same tones as the badges, so
  the calendar reads with the vocabulary the rest of the app uses.
*/
const CHIP_TONE: Record<string, string> = {
  [PostStatus.DRAFT]: 'neutral',
  [PostStatus.IN_INTERNAL_REVIEW]: 'info',
  [PostStatus.READY_FOR_CLIENT]: 'warning',
  [PostStatus.CHANGES_REQUESTED]: 'warning',
  [PostStatus.APPROVED]: 'success',
  [PostStatus.SCHEDULED]: 'accent',
  [PostStatus.PUBLISHED]: 'success',
  [PostStatus.CANCELED]: 'danger',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The month as the Social Media Manager plans it.
 *
 * Every post with a `scheduledAt` lands on its day, coloured by status;
 * posts without a date sit in a tray under the grid so they are not lost.
 * A day with posts in the past that are still Scheduled is flagged — the
 * same "due to publish" the strip above the board catches.
 */
export function ContentCalendar({ posts, initialMonth }: { posts: ContentPost[]; initialMonth?: Date }) {
  const [cursor, setCursor] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const today = startOfDay(new Date());

  const { weeks, unscheduled } = useMemo(() => {
    const byDay = new Map<string, ContentPost[]>();
    const undated: ContentPost[] = [];
    posts.forEach((post) => {
      if (!post.scheduledAt) { undated.push(post); return; }
      const key = dayKey(new Date(post.scheduledAt));
      byDay.set(key, [...(byDay.get(key) ?? []), post]);
    });
    byDay.forEach((list) => list.sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')));

    // Grid starts on the Monday on or before the 1st, ends on the Sunday on or after the last day.
    const first = startOfMonth(cursor);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const rows: Array<Array<{ date: Date; posts: ContentPost[]; inMonth: boolean }>> = [];
    const day = new Date(gridStart);
    do {
      const row = [];
      for (let i = 0; i < 7; i += 1) {
        row.push({ date: new Date(day), posts: byDay.get(dayKey(day)) ?? [], inMonth: day.getMonth() === cursor.getMonth() });
        day.setDate(day.getDate() + 1);
      }
      rows.push(row);
    } while (day.getMonth() === cursor.getMonth());
    return { weeks: rows, unscheduled: undated };
  }, [cursor, posts]);

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const inMonthCount = weeks.flat().filter((cell) => cell.inMonth).reduce((sum, cell) => sum + cell.posts.length, 0);

  return (
    <Card className="calendar">
      <div className="calendar__head">
        <div className="button-row">
          <Button variant="secondary" size="sm" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">‹</Button>
          <Button variant="secondary" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
          <Button variant="secondary" size="sm" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">›</Button>
        </div>
        <h2 className="calendar__title">{monthLabel} <span className="muted">· {inMonthCount} {inMonthCount === 1 ? 'post' : 'posts'}</span></h2>
      </div>

      <div className="calendar__grid" role="grid" aria-label={`Content calendar, ${monthLabel}`}>
        {WEEKDAYS.map((name) => <div key={name} className="calendar__weekday" role="columnheader">{name}</div>)}
        {weeks.flat().map((cell) => {
          const isToday = cell.date.getTime() === today.getTime();
          const overdue = cell.date.getTime() < today.getTime() && cell.posts.some((post) => post.status === PostStatus.SCHEDULED);
          return (
            <div key={cell.date.toISOString()} className={clsx('calendar__day', !cell.inMonth && 'calendar__day--outside', isToday && 'calendar__day--today', overdue && 'calendar__day--overdue')} role="gridcell">
              <span className="calendar__date">{cell.date.getDate()}</span>
              <div className="calendar__chips">
                {cell.posts.slice(0, 3).map((post) => (
                  <Link key={post.id} to={appRoutes.post(post.id)} className={`calendar__chip calendar__chip--${CHIP_TONE[post.status] ?? 'neutral'}`} title={`${post.title} · ${humanize(post.status)}${post.platform ? ` · ${humanize(post.platform)}` : ''}`}>
                    {post.title}
                  </Link>
                ))}
                {cell.posts.length > 3 ? <span className="calendar__more">+{cell.posts.length - 3} more</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      {unscheduled.length ? (
        <div className="calendar__tray">
          <p className="eyebrow">Not scheduled yet · {unscheduled.length}</p>
          <div className="calendar__tray-list">
            {unscheduled.map((post) => (
              <Link key={post.id} to={appRoutes.post(post.id)} className={`calendar__chip calendar__chip--${CHIP_TONE[post.status] ?? 'neutral'}`} title={`${post.title} · ${humanize(post.status)}`}>
                {post.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function startOfDay(date: Date): Date { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function startOfMonth(date: Date): Date { const d = startOfDay(date); d.setDate(1); return d; }
function addMonths(date: Date, delta: number): Date { const d = startOfMonth(date); d.setMonth(d.getMonth() + delta); return d; }
function dayKey(date: Date): string { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
