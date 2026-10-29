// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppNotification } from '@/types/domain';
import { NotificationItem } from './NotificationItem';

afterEach(cleanup);

const notification = (readAt: string | null = null): AppNotification => ({
  id: 'n1', type: 'TASK_ASSIGNED', title: 'New task assigned', message: 'Revise the carousel.', readAt, createdAt: '2026-10-29T09:00:00.000Z',
});

describe('NotificationItem structure (A-2)', () => {
  it('is an article holding a named open button, its message and time, and a separate action', () => {
    const { container } = render(<NotificationItem notification={notification()} onSelect={vi.fn()} action={<button type="button">Mark read</button>} />);
    const article = container.querySelector('article')!;
    expect(article).not.toHaveAttribute('role');
    expect(article).not.toHaveAttribute('aria-label');
    expect(article).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('button', { name: 'New task assigned, unread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark read' })).toBeInTheDocument();
    // Neither button is inside the other.
    expect(screen.getByRole('button', { name: 'New task assigned, unread' }).contains(screen.getByRole('button', { name: 'Mark read' }))).toBe(false);
    expect(screen.getByText('Revise the carousel.')).toBeVisible();
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-10-29T09:00:00.000Z');
  });

  it('opens once on click, Enter or Space; the action never opens it', async () => {
    const onSelect = vi.fn();
    const onMark = vi.fn();
    render(<NotificationItem notification={notification()} onSelect={onSelect} action={<button type="button" onClick={onMark}>Mark read</button>} />);
    const user = userEvent.setup();
    const open = screen.getByRole('button', { name: 'New task assigned, unread' });

    await user.click(open);
    expect(onSelect).toHaveBeenCalledTimes(1);
    open.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    screen.getByRole('button', { name: 'Mark read' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onMark).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('Tab order: open, then the action', async () => {
    render(<NotificationItem notification={notification()} onSelect={vi.fn()} action={<button type="button">Mark read</button>} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'New task assigned, unread' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Mark read' })).toHaveFocus();
  });

  it('a read item drops "unread" from the name', () => {
    render(<NotificationItem notification={notification('2026-10-29T10:00:00.000Z')} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'New task assigned' })).toBeInTheDocument();
  });

  it('with nothing to open: no button, and unread is still said', () => {
    render(<NotificationItem notification={notification()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('New task assigned')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Unread' })).toBeInTheDocument();
  });
});
