import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@/config/apiRoutes';
import { normalizeAttachment } from './attachments';

describe('attachments', () => {
  it('keeps the documented shape as-is', () => {
    const raw = {
      id: 'a1', entityType: 'LEAD' as const, entityId: 'l1', label: 'Brief', uploadedById: 'u1',
      uploadedBy: { id: 'u1', fullName: 'Maria Haddad' }, createdAt: '2026-09-27T10:00:00Z',
      file: { id: 'f1', originalName: 'brief.pdf', mimeType: 'application/pdf', size: 182000 },
    };
    expect(normalizeAttachment(raw, { entityType: 'LEAD', entityId: 'l1' })).toEqual(raw);
  });

  it('reads a pre-migration task row without crashing', () => {
    const result = normalizeAttachment({ id: 'a2', taskId: 't1', fileId: 'f2', createdAt: '2026-09-01T00:00:00Z' }, { entityType: 'TASK', entityId: 't1' });
    expect(result).toMatchObject({ entityType: 'TASK', entityId: 't1', label: null, file: { id: 'f2' } });
  });

  it('builds one path shape for every parent, and no id segment for the brand profile', () => {
    expect(apiRoutes.attachments.list('c1', { entityType: 'CAMPAIGN', entityId: 'x' })).toBe('/companies/c1/campaigns/x/attachments');
    expect(apiRoutes.attachments.detail('c1', { entityType: 'TASK', entityId: 't' }, 'a')).toBe('/companies/c1/tasks/t/attachments/a');
    expect(apiRoutes.attachments.list('c1', { entityType: 'BRAND_PROFILE' })).toBe('/companies/c1/brand-profile/attachments');
  });
});
