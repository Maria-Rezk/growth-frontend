// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface Person {
  id: string;
  name: string;
  joined: string;
}

/** Deliberately unsorted, and mixed case — "acme" must not land after "Zoe". */
const ROWS: Person[] = [
  { id: '1', name: 'Zoe Haddad', joined: '2026-01-05' },
  { id: '2', name: 'acme holdings', joined: '2026-03-01' },
  { id: '3', name: 'Élan', joined: '2026-02-01' },
  { id: '4', name: 'Marco Polo', joined: '2026-04-01' },
];

const COLUMNS: Column<Person>[] = [
  { key: 'name', header: 'Name', sortValue: (row) => row.name, render: (row) => row.name },
  { key: 'joined', header: 'Joined', sortValue: (row) => row.joined, render: (row) => row.joined },
];

// Testing Library only auto-cleans when the runner exposes `afterEach`
// globally, and this project runs vitest without `globals`.
afterEach(cleanup);

function renderedNames() {
  return screen.getAllByRole('row').slice(1).map((row) => row.firstElementChild?.textContent);
}

describe('DataTable', () => {
  it('keeps the given row order when no default sort is set', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} />);

    expect(renderedNames()).toEqual(['Zoe Haddad', 'acme holdings', 'Élan', 'Marco Polo']);
  });

  it('sorts on the default column before anyone touches a header', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} defaultSortKey="name" />);

    expect(renderedNames()).toEqual(['acme holdings', 'Élan', 'Marco Polo', 'Zoe Haddad']);
  });

  it('marks the default column as sorted so the order is not just incidental', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} defaultSortKey="name" />);

    const [nameHeader, joinedHeader] = screen.getAllByRole('columnheader');
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(joinedHeader.getAttribute('aria-sort')).toBeNull();
  });

  it('reverses the default column on the first click, and comes back on the second', async () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} defaultSortKey="name" />);

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(renderedNames()).toEqual(['Zoe Haddad', 'Marco Polo', 'Élan', 'acme holdings']);

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(renderedNames()).toEqual(['acme holdings', 'Élan', 'Marco Polo', 'Zoe Haddad']);
  });

  it('lets another column take over, leaving the default behind', async () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} defaultSortKey="name" />);

    await userEvent.click(screen.getByRole('button', { name: /Joined/ }));

    expect(renderedNames()).toEqual(['Zoe Haddad', 'Élan', 'acme holdings', 'Marco Polo']);
    expect(screen.getAllByRole('columnheader')[0].getAttribute('aria-sort')).toBeNull();
  });

  it('ignores a default naming a column that cannot be sorted', () => {
    const unsortable: Column<Person>[] = [
      { key: 'name', header: 'Name', render: (row) => row.name },
    ];
    render(<DataTable columns={unsortable} rows={ROWS} rowKey={(row) => row.id} defaultSortKey="name" />);

    expect(renderedNames()).toEqual(['Zoe Haddad', 'acme holdings', 'Élan', 'Marco Polo']);
  });
});
