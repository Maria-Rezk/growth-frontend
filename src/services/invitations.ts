import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoInvitations, makeId, pushNotification } from '@/services/demoStore';
import type { CompanyMembershipRole, Invitation, InvitationCreateResult } from '@/types/domain';

export const invitationsService = {
  async list(companyId: string): Promise<Invitation[]> {
    if (env.demoMode) return demoDelay(demoInvitations.filter((invitation) => invitation.companyId === companyId));
    const response = await http.get(apiRoutes.invitations.list(companyId));
    return unwrap<Invitation[]>(response.data);
  },
  async create(
    companyId: string,
    payload: { email: string; role: CompanyMembershipRole; fullName: string },
  ): Promise<InvitationCreateResult> {
    if (env.demoMode) {
      const invitation: Invitation = {
        id: makeId('invitation'),
        companyId,
        email: payload.email,
        fullName: payload.fullName,
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
    const response = await http.post(apiRoutes.invitations.create(companyId), payload);
    return response.data as InvitationCreateResult;
  },
};