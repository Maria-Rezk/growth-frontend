import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoInvitations, makeId, pushNotification } from '@/services/demoStore';
import type { InvitableRole, Invitation, InvitationCreateResult } from '@/types/domain';

export const invitationsService = {
  async list(companyId: string): Promise<Invitation[]> {
    if (env.demoMode) return demoDelay(demoInvitations.filter((invitation) => invitation.companyId === companyId));
    const response = await http.get(apiRoutes.invitations.list(companyId));
    return unwrap<Invitation[]>(response.data);
  },
  /**
   * Roles are typed as InvitableRole, not CompanyMembershipRole — the endpoint
   * rejects the wider set, so a mismatch is a compile error rather than a
   * runtime 400.
   *
   * Always sends `roles`, never the deprecated `role`, confirmed against the
   * backend. This is the last place the app sent a single role, so the API is
   * free to drop that field whenever it likes.
   */
  async create(
    companyId: string,
    payload: { email: string; roles: InvitableRole[]; fullName: string },
  ): Promise<InvitationCreateResult> {
    if (env.demoMode) {
      const invitation: Invitation = {
        id: makeId('invitation'),
        companyId,
        email: payload.email,
        fullName: payload.fullName,
        roles: payload.roles,
        role: payload.roles[0],
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      demoInvitations.unshift(invitation);
      pushNotification({ type: 'INVITATION_CREATED', title: 'Invitation created', message: payload.email, readAt: null });
      const token = `${invitation.id}.demo-${makeId('token')}`;
      return demoDelay({
        invitation,
        invitationToken: token,
        acceptPath: `/auth/accept-invitation?token=${token}`,
      });
    }
    // Live response is { invitation, invitationToken, acceptPath } — a custom
    // wrapper unwrap() doesn't recognize, so read response.data directly.
    const response = await http.post(apiRoutes.invitations.create(companyId), {
      email: payload.email,
      fullName: payload.fullName,
      roles: payload.roles,
    });
    return response.data as InvitationCreateResult;
  },
};