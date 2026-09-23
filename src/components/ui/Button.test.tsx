// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

afterEach(cleanup);

/*
  A native <button> with no `type` defaults to "submit" *only inside a
  <form>* — easy to miss in review since the same button looks and behaves
  identically outside one. This pins the fix: Button defaults to "button",
  and a form only submits when something actually asks it to.
*/
describe('Button', () => {
  it('defaults to type="button"', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toHaveAttribute('type', 'button');
  });

  it('still submits its form when the caller says type="submit"', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Save</Button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit an enclosing form when the caller passes no type', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={() => {}}>Cancel</Button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
