import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@/config/apiRoutes';
import { parseMyMemberships } from './memberships';

describe('GET /me/memberships', () => {
  it('is its own endpoint, separate from authentication', () => {
    expect(apiRoutes.me.memberships).toBe('/me/memberships');
    expect(apiRoutes.auth.me).not.toContain('memberships');
  });

  it('reads { memberships } as the list', () => {
    const rows = [{ id: 'm1', companyId: 'A', roles: ['DESIGNER', 'COPYWRITER'], status: 'ACTIVE' }];
    expect(parseMyMemberships({ memberships: rows })).toEqual(rows);
  });

  it('reads an empty list as a person who belongs to nothing', () => {
    expect(parseMyMemberships({ memberships: [] })).toEqual([]);
  });

  it('refuses anything that is not a list, rather than reading it as "no memberships"', () => {
    [undefined, null, {}, { memberships: null }, { memberships: 'none' }, [], 'oops'].forEach((body) => {
      expect(() => parseMyMemberships(body), JSON.stringify(body)).toThrow();
    });
  });
});
