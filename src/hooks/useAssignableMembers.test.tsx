// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Membership } from '@/types/domain';

let granted: string[] = [];
vi.mock('@/hooks/usePermission', () => ({ useCan: () => (permission: string) => granted.includes(permission) }));

const members = vi.fn();
vi.mock('@/services/companies', () => ({ companiesService: { members: (id: string) => members(id) } }));

const matrix = vi.fn();
vi.mock('@/services/responsibilities', () => ({ responsibilitiesService: { matrix: (id: string) => matrix(id) } }));

import { useAssignableMembers } from './useAssignableMembers';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  members.mockReset();
  matrix.mockReset();
});
afterEach(cleanup);

describe('useAssignableMembers', () => {
  it('reads the member directory where the person is allowed to', async () => {
    granted = ['members:manage'];
    const rows = [{ id: 'm1', companyId: 'A', userId: 'u1', roles: ['DESIGNER'], status: 'ACTIVE' }] as Membership[];
    members.mockResolvedValue(rows);

    const { result } = renderHook(() => useAssignableMembers('A'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(matrix).not.toHaveBeenCalled();
  });

  it('reads the member directory for whoever creates tasks (Social Media Manager, Art Director)', async () => {
    granted = ['tasks:edit'];
    members.mockResolvedValue([]);

    const { result } = renderHook(() => useAssignableMembers('A'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(members).toHaveBeenCalledWith('A');
    expect(matrix).not.toHaveBeenCalled();
  });

  it('uses the responsibility matrix for everybody else, and never asks the directory', async () => {
    granted = [];
    matrix.mockResolvedValue({
      areas: [],
      cells: [],
      members: [
        { userId: 'u2', fullName: 'Dana Designer', email: 'd@x.test', roles: ['DESIGNER', 'COPYWRITER'] },
        { userId: 'u3', fullName: 'Old Shape', email: 'o@x.test', role: 'SALES_AGENT' },
      ],
    });

    const { result } = renderHook(() => useAssignableMembers('A'), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(members).not.toHaveBeenCalled();
    expect(result.current.data?.[0]).toMatchObject({ userId: 'u2', companyId: 'A', roles: ['DESIGNER', 'COPYWRITER'], status: 'ACTIVE', user: { fullName: 'Dana Designer' } });
    // A response that only knows the deprecated single `role` still yields a usable list of roles.
    expect(result.current.data?.[1]).toMatchObject({ roles: ['SALES_AGENT'] });
  });
});
