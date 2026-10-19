import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http } from '@/lib/http';
import { getAllItems } from '@/lib/paging';
import { demoDelay, demoInvitations, makeId, pushNotification } from '@/services/demoStore';
import type { InvitableRole, Invitation, InvitationCreateResult } from '@/types/domain';

export const invitationsService = {
  async list(companyId: string): Promise<Invitation[]> {
    if (env.demoMode) return demoDelay(demoInvitations.filter((invitation) => invitation.companyId === companyId));
    return getAllItems<Invitation>(apiRoutes.invitations.list(companyId));
  },
  /**
   * One role per invitation. `CreateCompanyInvitationDto` declares a required
   * `role` and no `roles`, and the API rejects unknown fields, so sending an
   * array is a 400. Accepting the invitation turns it into `roles: [role]`;
   * further roles are added on the membership afterwards.
   *
   * Typed as InvitableRole: the product offers a narrower set than the API's
   * full membership enum.
   */
  async create(
    companyId: string,
    payload: { email: string; role: InvitableRole; fullName: string },
  ): Promise<InvitationCreateResult> {
    if (env.demoMode) {
      const invitation: Invitation = {
        id: makeId('invitation'),
        companyId,
        email: payload.email,
        fullName: payload.fullName,
        roles: [payload.role],
        role: payload.role,
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
      role: payload.role,
    });
    return response.data as InvitationCreateResult;
  },
};