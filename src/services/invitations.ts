import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, notShippedError, unwrap } from '@/lib/http';
import { demoDelay, demoInvitations, makeId, pushNotification } from '@/services/demoStore';
import type { ApiErrorShape, InvitableRole, Invitation, InvitationCreateResult } from '@/types/domain';

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
   * A single role is sent as the original `{ role }` body. Only a genuine
   * multi-role invite sends `{ roles }`, because unlike the membership routes
   * this endpoint is not documented as accepting an array, and the API rejects
   * unknown properties outright. Keeping the one-role path byte-identical means
   * the common case cannot regress, and a multi-role attempt fails loudly with
   * copy that says what to do instead.
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
    const body = payload.roles.length === 1
      ? { email: payload.email, fullName: payload.fullName, role: payload.roles[0] }
      : { email: payload.email, fullName: payload.fullName, roles: payload.roles };

    try {
      // Live response is { invitation, invitationToken, acceptPath } — a custom
      // wrapper unwrap() doesn't recognize, so read response.data directly.
      const response = await http.post(apiRoutes.invitations.create(companyId), body);
      return response.data as InvitationCreateResult;
    } catch (error) {
      /*
        A rejected multi-role body almost certainly means this backend still
        takes one role per invitation. Say that, rather than surfacing the
        API's "property roles should not exist" to someone filling in a form.
      */
      if (payload.roles.length > 1 && (error as ApiErrorShape | undefined)?.statusCode === 400) {
        throw notShippedError(
          error,
          'This backend still invites people with a single role. Invite them with one role, then add the others once they accept.',
        );
      }
      throw error;
    }
  },
};