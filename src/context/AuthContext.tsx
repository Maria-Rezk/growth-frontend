import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '@/services/auth';
import { env } from '@/config/env';
import { errorMessage, setUnauthorizedHandler, tokenStorage } from '@/lib/http';
import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@/types/domain';

type AcceptResult = { accepted: boolean; authenticated: boolean };

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<boolean>;
  register: (payload: RegisterRequest) => Promise<boolean>;
  acceptInvitation: (payload: { token: string; fullName?: string; password?: string }) => Promise<AcceptResult>;
  logout: () => void;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_USER: User = {
  id: 'demo-user',
  email: 'demo@solu1ions.com',
  fullName: 'Demo User',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => (env.demoMode ? DEMO_USER : null));
  const [token, setToken] = useState<string | null>(() => (env.demoMode ? 'demo-token' : tokenStorage.get()));
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    if (env.demoMode) {
      setToken('demo-token');
      setUser(DEMO_USER);
      return;
    }

    tokenStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const applyAuth = useCallback((auth: AuthResponse) => {
    tokenStorage.set(auth.accessToken);
    setToken(auth.accessToken);
    setUser(auth.user);
  }, []);

  const reloadUser = useCallback(async () => {
    if (!tokenStorage.get()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const currentUser = await authService.me();
      setUser(currentUser);
    } catch (err) {
      logout();
      setError(err instanceof Error ? err.message : 'Could not restore session.');
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (env.demoMode) {
      setUnauthorizedHandler(null);
      setLoading(false);
      setToken('demo-token');
      setUser(DEMO_USER);
      return;
    }

    setUnauthorizedHandler(logout);
    void reloadUser();
    return () => setUnauthorizedHandler(null);
  }, [logout, reloadUser]);

  const login = useCallback(
    async (payload: LoginRequest) => {
      setError(null);
      try {
        applyAuth(await authService.login(payload));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed.');
        return false;
      }
    },
    [applyAuth],
  );

  const register = useCallback(
    async (payload: RegisterRequest) => {
      setError(null);
      try {
        applyAuth(await authService.register(payload));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed.');
        return false;
      }
    },
    [applyAuth],
  );

  const acceptInvitation = useCallback(
    async (payload: { token: string; fullName?: string; password?: string }): Promise<AcceptResult> => {
      setError(null);
      try {
        const result = await authService.acceptInvitation(payload);
        // The accept endpoint creates the user/membership but returns no token.
        // When we have credentials (new-user flow), chain a login to get a
        // session. The email comes from the response — the invitee never types
        // one, since the address is fixed by the invitation.
        const email = result.user?.email;
        if (email && payload.password) {
          try {
            applyAuth(await authService.login({ email, password: payload.password }));
            return { accepted: true, authenticated: true };
          } catch {
            // Accepted, but auto-login failed — fall through to manual login.
          }
        }
        return { accepted: true, authenticated: false };
      } catch (err) {
        setError(errorMessage(err));
        return { accepted: false, authenticated: false };
      }
    },
    [applyAuth],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      error,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      acceptInvitation,
      logout,
      reloadUser,
    }),
    [acceptInvitation, error, loading, login, logout, register, reloadUser, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}