import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '@/services/auth';
import { env } from '@/config/env';
import {
  errorMessage,
  refreshSession,
  setForbiddenHandler,
  setSessionRefreshedHandler,
  setUnauthorizedHandler,
  tokenStorage,
} from '@/lib/http';
import { demoUser as DEMO_USER } from '@/services/demoStore';
import type { AuthResponse, LoginRequest, User } from '@/types/domain';

type AcceptResult = { accepted: boolean; authenticated: boolean };

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<boolean>;
  acceptInvitation: (payload: { token: string; fullName?: string; password?: string }) => Promise<AcceptResult>;
  logout: () => void;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

  /*
    Flow 7 — a role that changed mid-session.

    A demoted admin keeps a token still claiming the old role until it is
    re-issued, so the UI can offer an action the API now refuses. Any 403 is
    treated as "re-establish who I am", once: `syncingRole` collapses the burst
    of 403s a dashboard full of independent widgets produces into a single
    round-trip. Guards then re-render from the true role on their own — no
    screen has to handle this, and no dead-end error is shown.

    Refresh first, not /auth/me. Refresh re-issues the token, which is what
    actually clears the mismatch; /auth/me would correct what the UI *shows*
    while leaving the stale token in place, so the API would go on answering
    403 for the same actions. /auth/me is kept only as the fallback for when
    refresh is unavailable — better a corrected UI than none.
  */
  const syncingRole = useRef(false);

  const syncRoleAfterForbidden = useCallback(async () => {
    if (syncingRole.current || !tokenStorage.get()) return;
    syncingRole.current = true;
    try {
      const refreshed = await refreshSession();
      if (refreshed) {
        setToken(refreshed);
        return;
      }
      setUser(await authService.me());
    } catch {
      // A 401 on the re-read already signed the user out through the
      // unauthorized handler; anything else leaves the session as it was.
    } finally {
      syncingRole.current = false;
    }
  }, []);

  useEffect(() => {
    if (env.demoMode) {
      setUnauthorizedHandler(null);
      setForbiddenHandler(null);
      setSessionRefreshedHandler(null);
      setLoading(false);
      setToken('demo-token');
      setUser(DEMO_USER);
      return;
    }

    setUnauthorizedHandler(logout);
    setForbiddenHandler(() => {
      void syncRoleAfterForbidden();
    });
    /*
      A silent refresh (the one the 401 interceptor performs mid-request) still
      has to reach React state, or the app would keep rendering the pre-refresh
      user and token while the network layer has moved on.
    */
    setSessionRefreshedHandler((refreshedUser) => {
      setToken(tokenStorage.get());
      setUser(refreshedUser);
    });
    void reloadUser();
    return () => {
      setUnauthorizedHandler(null);
      setForbiddenHandler(null);
      setSessionRefreshedHandler(null);
    };
  }, [logout, reloadUser, syncRoleAfterForbidden]);

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
      acceptInvitation,
      logout,
      reloadUser,
    }),
    [acceptInvitation, error, loading, login, logout, reloadUser, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}