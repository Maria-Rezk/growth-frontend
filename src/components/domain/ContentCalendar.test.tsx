// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PostStatus, type ContentPost } from '@/types/domain';
import { ContentCalendar } from './ContentCalendar';

afterEach(cleanup);

const post = (id: string, title: string, status: PostStatus, scheduledAt: string | null) =>
  ({ id, title, status, scheduledAt, platform: 'INSTAGRAM' }) as unknown as ContentPost;

function setup(posts: ContentPost[]) {
  render(<MemoryRouter><ContentCalendar posts={posts} initialMonth={new Date(2026, 10, 1)} /></MemoryRouter>);
  return userEvent.setup();
}

const fullDate = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

describe('ContentCalendar semantics (A-1)', () => {
  it('is a table of weeks with named weekday headers, not an ARIA grid', () => {
    setup([]);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: /^Content calendar, November 2026$/ });
    const rows = within(table).getAllByRole('row');
    // November 2026: Mon 26 Oct to Sun 6 Dec, six weeks, plus the weekday row.
    expect(rows).toHaveLength(7);
    const headers = within(rows[0]).getAllByRole('columnheader');
    expect(headers.map((header) => header.getAttribute('aria-label'))).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    for (const row of rows.slice(1)) expect(within(row).getAllByRole('cell')).toHaveLength(7);
  });

  it('names each day in full, with its post count, outside days included', () => {
    setup([post('p1', 'Launch teaser', PostStatus.APPROVED, new Date(2026, 10, 4, 10).toISOString())]);
    expect(screen.getByText(`${fullDate(new Date(2026, 10, 4))}, 1 post`)).toBeInTheDocument();
    expect(screen.getByText(`${fullDate(new Date(2026, 10, 5))}, no posts`)).toBeInTheDocument();
    // A day from the neighbouring month says which month it is.
    expect(screen.getByText(`${fullDate(new Date(2026, 9, 26))}, no posts`)).toBeInTheDocument();
  });

  it('says what the colours say: today, and a scheduled post past its time', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9);
    render(<MemoryRouter><ContentCalendar posts={[post('p2', 'Missed slot', PostStatus.SCHEDULED, yesterday.toISOString())]} /></MemoryRouter>);
    expect(screen.getByText(new RegExp(`^${fullDate(now)}, today, `))).toBeInTheDocument();
    if (yesterday.getMonth() === now.getMonth() || screen.queryByText(new RegExp(`^${fullDate(yesterday)}`))) {
      expect(screen.getByText(`${fullDate(yesterday)}, a scheduled post is past its time, 1 post`)).toBeInTheDocument();
    }
  });

  it('links each post by its title, status and platform, and its hover title is the same text', () => {
    setup([post('p1', 'Launch teaser', PostStatus.APPROVED, new Date(2026, 10, 4, 10).toISOString())]);
    const link = screen.getByRole('link', { name: 'Launch teaser, Approved, Instagram' });
    expect(link).toHaveAttribute('href', '/posts/p1');
    expect(link).toHaveAttribute('title', 'Launch teaser, Approved, Instagram');
  });

  it('Tab goes through the month buttons, then the posts in date order', async () => {
    const user = setup([
      post('late', 'Later post', PostStatus.DRAFT, new Date(2026, 10, 20, 10).toISOString()),
      post('early', 'Early post', PostStatus.DRAFT, new Date(2026, 10, 3, 10).toISOString()),
    ]);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Today' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: /^Early post/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: /^Later post/ })).toHaveFocus();
  });

  it('month navigation still works and renames the table', async () => {
    const user = setup([]);
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('table', { name: 'Content calendar, December 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('table', { name: 'Content calendar, October 2026' })).toBeInTheDocument();
  });
});
