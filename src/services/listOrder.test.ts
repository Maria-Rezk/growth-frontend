import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Only `http` is stubbed — `unwrap` and the rest stay real, so this exercises
  the same envelope handling the app runs through.
*/
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return { ...actual, http: { get: vi.fn() } };
});

const { http } = await import('@/lib/http');
const { companiesService } = await import('@/services/companies');
const { usersService } = await import('@/services/users');

const get = http.get as ReturnType<typeof vi.fn>;

/** The order the API returns them in: insertion, not alphabetical. */
const CLIENTS = [
  { id: '1', name: 'Dental Excellence (Dr. Nicola)' },
  { id: '2', name: 'Vendi' },
  { id: '3', name: 'IEcd' },
  { id: '4', name: 'alpha capital' },
  { id: '5', name: 'Élan' },
  { id: '6', name: 'Client 10' },
  { id: '7', name: 'Client 2' },
];

beforeEach(() => {
  get.mockReset();
});

describe('client and employee lists', () => {
  it('returns clients A→Z regardless of the order the API sends', async () => {
    get.mockResolvedValue({ data: CLIENTS });

    const names = (await companiesService.list()).map((client) => client.name);

    expect(names).toEqual([
      'alpha capital', // case-insensitive: not filed after every capitalised name
      'Client 2', // numeric: 2 before 10, not "10" before "2"
      'Client 10',
      'Dental Excellence (Dr. Nicola)',
      'Élan', // accent-insensitive: sorts as "Elan", not after Z
      'IEcd',
      'Vendi',
    ]);
  });

  it('sorts clients inside an envelope response too', async () => {
    get.mockResolvedValue({ data: { data: [...CLIENTS].reverse() } });

    const names = (await companiesService.list()).map((client) => client.name);

    expect(names[0]).toBe('alpha capital');
    expect(names[names.length - 1]).toBe('Vendi');
  });

  it('orders employees by the name shown in the UI, email when unnamed', async () => {
    get.mockResolvedValue({
      data: [
        { id: '1', email: 'zoe@example.com', fullName: 'Zoe Haddad', clients: [] },
        { id: '2', email: 'adam@example.com', fullName: null, clients: [] },
        { id: '3', email: 'nour@example.com', fullName: 'Nour Aziz', clients: [] },
      ],
    });

    const shown = (await usersService.list()).map((employee) => employee.fullName ?? employee.email);

    // The unnamed one sorts under its email rather than being pushed to the end.
    expect(shown).toEqual(['adam@example.com', 'Nour Aziz', 'Zoe Haddad']);
  });
});
