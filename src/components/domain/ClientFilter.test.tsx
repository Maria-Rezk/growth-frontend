// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFilter, type ClientFilterOption } from '@/components/domain/ClientFilter';

/** Twelve clients, A→Z as the component expects them, four with open work. */
const OPTIONS: ClientFilterOption[] = [
  { id: 'alia', name: 'Alia Studio', count: 0 },
  { id: 'alzaman', name: 'Al Zaman', count: 0 },
  { id: 'candle', name: 'Candle Couture', count: 0 },
  { id: 'cleanfor', name: 'Cleanfor', count: 0 },
  { id: 'curby', name: 'Curby', count: 2 },
  { id: 'fixhub', name: 'Fixhub', count: 1 },
  { id: 'iecd', name: 'IEcd', count: 3 },
  { id: 'internal', name: 'Internal', count: 0 },
  { id: 'livelove', name: 'Live Love Syria', count: 0 },
  { id: 'marco', name: 'Marco Polo', count: 0 },
  { id: 'taxero', name: 'Taxero', count: 0 },
  { id: 'vendi', name: 'Vendi', count: 4 },
];

/*
  Testing Library only auto-cleans when the runner exposes `afterEach` globally,
  and this project runs vitest without `globals`. Without this every render
  stacks up in one document and the role queries match across all of them.
*/
afterEach(cleanup);

describe('ClientFilter', () => {
  it('chips only the clients with open work, busiest first', () => {
    render(<ClientFilter options={OPTIONS} value="all" total={10} onChange={vi.fn()} />);

    const chips = screen.getAllByRole('button').map((button) => button.textContent);

    // "All clients" leads; then the four with work, ranked; then the picker.
    expect(chips).toEqual(['All clients10', 'Vendi4', 'IEcd3', 'Curby2', 'Fixhub1', '8 more']);
  });

  it('caps the chip row and pushes the rest into the picker', () => {
    const busy = OPTIONS.map((option, index) => ({ ...option, count: index + 1 }));
    render(<ClientFilter options={busy} value="all" total={78} onChange={vi.fn()} maxChips={3} />);

    expect(screen.getAllByRole('button')).toHaveLength(5); // all + 3 chips + picker
    expect(screen.getByRole('button', { name: /9 more/ })).toBeTruthy();
  });

  it('keeps a chip for the selected client even when it has nothing open', () => {
    render(<ClientFilter options={OPTIONS} value="taxero" total={10} onChange={vi.fn()} />);

    const selected = screen.getByRole('button', { pressed: true });
    expect(selected.textContent).toBe('Taxero0');
    // Promoted out of the picker rather than listed twice.
    expect(screen.getByRole('button', { name: /7 more/ })).toBeTruthy();
  });

  it('clears the filter when the active chip is clicked again', async () => {
    const onChange = vi.fn();
    render(<ClientFilter options={OPTIONS} value="vendi" total={10} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { pressed: true }));

    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('searches and selects from the picker by keyboard alone', async () => {
    const onChange = vi.fn();
    render(<ClientFilter options={OPTIONS} value="all" total={10} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /8 more/ }));

    const search = screen.getByRole('combobox');
    await userEvent.type(search, 'syr');

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);

    await userEvent.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('livelove');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves the highlight with the arrow keys and wraps at the ends', async () => {
    const onChange = vi.fn();
    render(<ClientFilter options={OPTIONS} value="all" total={10} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /8 more/ }));
    // Up from the first option wraps to the last — Taxero, the 8th overflow client.
    await userEvent.keyboard('{ArrowUp}{Enter}');

    expect(onChange).toHaveBeenCalledWith('taxero');
  });

  it('closes on Escape without selecting, and returns focus to the trigger', async () => {
    const onChange = vi.fn();
    render(<ClientFilter options={OPTIONS} value="all" total={10} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: /8 more/ });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('says so when the search matches nothing', async () => {
    render(<ClientFilter options={OPTIONS} value="all" total={10} onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /8 more/ }));
    await userEvent.type(screen.getByRole('combobox'), 'zzz');

    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('zzz');
  });

  it('drops the picker once every client fits in the row', () => {
    const few = OPTIONS.slice(0, 3).map((option) => ({ ...option, count: 1 }));
    render(<ClientFilter options={few} value="all" total={3} onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /more/ })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});
