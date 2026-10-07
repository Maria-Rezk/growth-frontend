// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Membership, PlatformRole } from '@/types/domain';

let platformRole: PlatformRole = 'USER';
let memberships: Membership[] = [];

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', platformRole } }) }));
vi.mock('@/context/CompanyContext', () => ({ useCompany: () => ({ activeCompanyId: 'A', memberships }) }));

import { useCan } from './usePermission';

const member = (roles: Membership['roles'], status: Membership['status'] = 'ACTIVE'): Membership =>
  ({ id: 'm', companyId: 'A', userId: 'u1', roles, role: roles[0], status }) as Membership;

const can = (permission: Parameters<ReturnType<typeof useCan>>[0]) => renderHook(() => useCan()).result.current(permission);

beforeEach(() => {
  platformRole = 'USER';
  memberships = [];
});

describe('useCan', () => {
  it('lets both platform admins through without any membership, as the API does', () => {
    (['SUPER_ADMIN', 'AGENCY_ADMIN'] as const).forEach((role) => {
      platformRole = role;
      memberships = [];
      expect(can('posts:create')).toBe(true);
      expect(can('automations:manage')).toBe(true);
      expect(can('reports:generate')).toBe(true);
    });
  });

  it('gives an ordinary user exactly what their roles on this client allow', () => {
    memberships = [member(['DESIGNER'])];
    expect(can('postAssets:manage')).toBe(true);
    expect(can('posts:create')).toBe(false);
    expect(can('automations:manage')).toBe(false);
  });

  it('is the union of several roles', () => {
    memberships = [member(['DESIGNER', 'ACCOUNT_MANAGER'])];
    expect(can('postAssets:manage')).toBe(true);
    expect(can('automations:manage')).toBe(true);
  });

  it('gives nothing to somebody with no active membership, or a suspended one', () => {
    expect(can('posts:approve')).toBe(false);
    memberships = [member(['ACCOUNT_MANAGER'], 'SUSPENDED')];
    expect(can('posts:approve')).toBe(false);
  });

  it('keeps client roles out of agency actions', () => {
    memberships = [member(['CLIENT_OWNER'])];
    expect(can('posts:approve')).toBe(true);
    expect(can('tasks:edit')).toBe(false);
    expect(can('posts:create')).toBe(false);
  });
});
