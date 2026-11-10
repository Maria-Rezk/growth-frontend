import { describe, expect, it } from 'vitest';
import { PlatformRole, type Employee } from '@/types/domain';
import { deactivationBlockReason, employeeStatus, hidesStatusAction } from './employeeStatus';

const person = (id: string, platformRole: PlatformRole, status = 'ACTIVE'): Employee => ({
  id,
  email: `${id}@example.test`,
  fullName: id,
  platformRole,
  status,
  clients: [],
});

const staff = person('staff', PlatformRole.USER);
const superA = person('super-a', PlatformRole.SUPER_ADMIN);
const superB = person('super-b', PlatformRole.SUPER_ADMIN);
const superInactive = person('super-c', PlatformRole.SUPER_ADMIN, 'INACTIVE');

describe('deactivationBlockReason', () => {
  it('allows deactivating an ordinary employee', () => {
    expect(deactivationBlockReason(staff, { viewerId: 'admin', viewerIsSuperAdmin: false, employees: [staff] })).toBeNull();
  });

  it('blocks deactivating yourself', () => {
    expect(deactivationBlockReason(staff, { viewerId: 'staff', viewerIsSuperAdmin: true, employees: [staff] }))
      .toMatch(/your own account/);
  });

  it('blocks an Admin from deactivating a Super Admin', () => {
    expect(deactivationBlockReason(superA, { viewerId: 'admin', viewerIsSuperAdmin: false, employees: [superA, superB] }))
      .toMatch(/Only a Super Admin/);
  });

  it('blocks deactivating the last active Super Admin (inactive ones do not count)', () => {
    expect(deactivationBlockReason(superA, { viewerId: 'other', viewerIsSuperAdmin: true, employees: [superA, superInactive] }))
      .toMatch(/only active Super Admin/);
  });

  it('allows a Super Admin to deactivate another Super Admin when one remains', () => {
    expect(deactivationBlockReason(superB, { viewerId: 'super-a', viewerIsSuperAdmin: true, employees: [superA, superB] }))
      .toBeNull();
  });
});

describe('employeeStatus', () => {
  it('defaults a missing status to ACTIVE', () => {
    expect(employeeStatus({ status: undefined })).toBe('ACTIVE');
  });
});

describe('hidesStatusAction (guide 1.5: hide, not disable)', () => {
  it('hides the action on your own row', () => {
    expect(hidesStatusAction(staff, { viewerId: 'staff', viewerIsSuperAdmin: true })).toBe(true);
  });

  it('hides it on a Super Admin row for an Agency Admin, but not for a Super Admin', () => {
    expect(hidesStatusAction(superA, { viewerId: 'admin', viewerIsSuperAdmin: false })).toBe(true);
    expect(hidesStatusAction(superA, { viewerId: 'super-b', viewerIsSuperAdmin: true })).toBe(false);
  });

  it('offers it on an ordinary employee row', () => {
    expect(hidesStatusAction(staff, { viewerId: 'admin', viewerIsSuperAdmin: false })).toBe(false);
  });
});
