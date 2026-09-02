import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Only `http` is stubbed, so the real payload construction runs. These pin what
  goes over the wire: the API rejects unknown properties and takes `roles` or
  the deprecated `role`, never both, so an accidental extra field is a 400 on a
  screen rather than a type error at build time.
*/
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return { ...actual, http: { post: vi.fn(), patch: vi.fn() } };
});

const { http } = await import('@/lib/http');
const { companiesService } = await import('@/services/companies');
const { invitationsService } = await import('@/services/invitations');

const post = http.post as ReturnType<typeof vi.fn>;
const patch = http.patch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} });
  patch.mockReset().mockResolvedValue({ data: {} });
});

/** The body actually sent, from the most recent call. */
function sentBody(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls[0][1];
}

describe('addMember', () => {
  it('sends every role in one request', async () => {
    await companiesService.addMember('c1', { userId: 'u1', roles: ['DESIGNER', 'COPYWRITER'] });

    expect(sentBody(post)).toEqual({ userId: 'u1', roles: ['DESIGNER', 'COPYWRITER'] });
  });

  it('never sends the deprecated role alongside roles', async () => {
    await companiesService.addMember('c1', { userId: 'u1', roles: ['DESIGNER'] });

    expect(sentBody(post)).not.toHaveProperty('role');
  });

  it('preserves the order given — the first role is the main one', async () => {
    await companiesService.addMember('c1', { userId: 'u1', roles: ['COPYWRITER', 'DESIGNER'] });

    expect(sentBody(post).roles).toEqual(['COPYWRITER', 'DESIGNER']);
  });
});

describe('updateMember', () => {
  it('sends the whole replacement set', async () => {
    await companiesService.updateMember('c1', 'm1', { roles: ['DESIGNER', 'ACCOUNT_MANAGER'] });

    expect(sentBody(patch)).toEqual({ roles: ['DESIGNER', 'ACCOUNT_MANAGER'] });
  });

  it('can change status without touching roles', async () => {
    await companiesService.updateMember('c1', 'm1', { status: 'SUSPENDED' });

    const body = sentBody(patch);
    expect(body).toEqual({ status: 'SUSPENDED' });
    expect(body).not.toHaveProperty('roles');
  });
});

describe('invitations.create', () => {
  it('sends roles, not the deprecated role, even for a single one', async () => {
    post.mockResolvedValue({ data: { invitation: {}, invitationToken: 't', acceptPath: '/a' } });

    await invitationsService.create('c1', {
      email: 'new@example.com',
      fullName: 'New Person',
      roles: ['CLIENT_REVIEWER'],
    });

    const body = sentBody(post);
    expect(body).toEqual({ email: 'new@example.com', fullName: 'New Person', roles: ['CLIENT_REVIEWER'] });
    expect(body).not.toHaveProperty('role');
  });

  it('invites with several roles in one request', async () => {
    post.mockResolvedValue({ data: { invitation: {}, invitationToken: 't', acceptPath: '/a' } });

    await invitationsService.create('c1', {
      email: 'new@example.com',
      fullName: 'New Person',
      roles: ['CLIENT_REVIEWER', 'SALES_AGENT'],
    });

    expect(sentBody(post).roles).toEqual(['CLIENT_REVIEWER', 'SALES_AGENT']);
  });
});
