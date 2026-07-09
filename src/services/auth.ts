import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoCompany, demoDelay, demoUser, makeId } from '@/services/demoStore';
import type {
  AcceptInvitationResult,
  AuthResponse,
  LoginRequest,
  Membership,
  RegisterRequest,
  User,
} from '@/types/domain';

export const authService = {
  async login(payload: LoginRequest): Promise<AuthResponse> {
    if (env.demoMode) return demoDelay({ accessToken: 'demo-token', user: { ...demoUser, email: payload.email } });
    const response = await http.post(apiRoutes.auth.login, payload);
    return unwrap<AuthResponse>(response.data);
  },
  async register(payload: RegisterRequest): Promise<AuthResponse> {
    if (env.demoMode) return demoDelay({ accessToken: 'demo-token', user: { ...demoUser, email: payload.email, fullName: payload.fullName } });
    const response = await http.post(apiRoutes.auth.register, payload);
    return unwrap<AuthResponse>(response.data);
  },
  async me(): Promise<User & { memberships?: Membership[] }> {
    if (env.demoMode) return demoDelay(demoUser);
    const response = await http.get(apiRoutes.auth.me);
    return unwrap<User & { memberships?: Membership[] }>(response.data);
  },
  async acceptInvitation(payload: {
    token: string;
    fullName?: string;
    email?: string;
    password?: string;
  }): Promise<AcceptInvitationResult> {
    if (env.demoMode) {
      const user: User = { ...demoUser, email: payload.email ?? demoUser.email, fullName: payload.fullName ?? demoUser.fullName };
      const membership: Membership = {
        id: makeId('membership'),
        companyId: demoCompany.id,
        userId: user.id,
        role: 'CLIENT_REVIEWER',
        status: 'ACTIVE',
        user,
        company: demoCompany,
      };
      return demoDelay({ user, membership });
    }
    // Live response is { user, membership } with NO accessToken — read directly.
    const response = await http.post(apiRoutes.auth.acceptInvitation, payload);
    return response.data as AcceptInvitationResult;
  },
};