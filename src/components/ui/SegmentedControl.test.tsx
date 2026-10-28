// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

afterEach(cleanup);

const options = [
  { label: 'All tasks', value: 'all' },
  { label: 'My tasks', value: 'mine' },
] as const;

describe('SegmentedControl', () => {
  it('marks exactly the selected option as pressed', () => {
    render(<SegmentedControl label="Scope" value="mine" options={[...options]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'My tasks' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All tasks' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Scope" value="all" options={[...options]} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'My tasks' }));
    expect(onChange).toHaveBeenCalledWith('mine');
  });
});
