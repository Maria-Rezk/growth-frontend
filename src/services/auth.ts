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
  /**
   * Accepts an invitation.
   *
   * The API takes `{ token, fullName, password }` for a new user and `{ token }`
   * alone for an existing one. No `email` — the address is already bound to the
   * token, and a mismatched one would be unresolvable. Optional fields are
   * omitted rather than sent empty, which would trip @IsNotEmpty / @MinLength
   * on the DTO.
   */
  async acceptInvitation(payload: {
    token: string;
    fullName?: string;
    password?: string;
  }): Promise<AcceptInvitationResult> {
    if (env.demoMode) {
      const user: User = { ...demoUser, fullName: payload.fullName ?? demoUser.fullName };
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
    const body: Record<string, string> = { token: payload.token };
    if (payload.fullName?.trim()) body.fullName = payload.fullName.trim();
    if (payload.password) body.password = payload.password;

    // Live response is { user, membership } with NO accessToken — read directly.
    const response = await http.post(apiRoutes.auth.acceptInvitation, body);
    return response.data as AcceptInvitationResult;
  },
};