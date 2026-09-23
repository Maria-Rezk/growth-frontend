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
import { useStorageSync } from '@/hooks/useStorageSync';
import { demoUser as DEMO_USER } from '@/services/demoStore';
import type { AuthResponse, LoginRequest, User } from '@/types/domain';

type AcceptResult = { accepted: boolean; authenticated: boolean };

/*
  Cross-tab sign-in/sign-out signal.

  The access token itself is never in browser storage (see tokenStorage in
  http.ts), so there is no shared secret here to watch — this key carries
  nothing but "something changed, go check", the same idea as a doorbell.
  Every tab reacts by re-running its own httpOnly-cookie-backed refresh
  (signing in elsewhere) or clearing its own state (signing out elsewhere),
  never by trusting a value read out of storage.
*/
const AUTH_BROADCAST_KEY = 'growth.auth.broadcast';

function broadcastAuthEvent(kind: 'signed-in' | 'signed-out'): void {
  try {
    window.localStorage.setItem(AUTH_BROADCAST_KEY, JSON.stringify({ kind, at: Date.now() }));
  } catch {
    // Best effort — other tabs simply won't hear about it until their own
    // next request notices the session changed.
  }
}

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

  /**
   * Clears this tab's session state. Used both by the explicit "Logout"
   * button and by automatic sign-out (a second 401, a failed refresh) — the
   * automatic path deliberately does *not* go through the exported `logout`
   * below, so an expired session never fires the "revoke on the server" call
   * or the cross-tab broadcast a person's own Logout click means.
   */
  const clearSession = useCallback(() => {
    if (env.demoMode) {
      setToken('demo-token');
      setUser(DEMO_USER);
      return;
    }

    tokenStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  /** The person's own "Logout" action: revoke the session, not just forget it locally, and tell other tabs. */
  const logout = useCallback(() => {
    clearSession();
    if (env.demoMode) return;
    void authService.logout();
    broadcastAuthEvent('signed-out');
  }, [clearSession]);

  const applyAuth = useCallback(
    (auth: AuthResponse) => {
      tokenStorage.set(auth.accessToken);
      setToken(auth.accessToken);
      setUser(auth.user);
      if (!env.demoMode) broadcastAuthEvent('signed-in');
    },
    [],
  );

  const reloadUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /*
        Nothing client-side says whether this browser has a session — the
        access token lives only in memory, so it's gone after every refresh
        by design (see tokenStorage in http.ts). The httpOnly refresh cookie
        is the actual source of truth: exchange it for a fresh access token
        the same way the 401 interceptor does mid-session, on every app boot.
      */
      const refreshedToken = await refreshSession();
      if (!refreshedToken) {
        // No cookie, or it's expired/revoked — the ordinary signed-out
        // state, not a failure worth showing an error for.
        setToken(null);
        setUser(null);
        return;
      }
      setToken(refreshedToken);
      setUser(await authService.me());
    } catch (err) {
      clearSession();
      setError(err instanceof Error ? err.message : 'Could not restore session.');
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

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

    // The automatic path: a second 401 or a failed refresh. Does not revoke
    // the server-side session or tell other tabs — see `clearSession` above.
    setUnauthorizedHandler(clearSession);
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
  }, [clearSession, reloadUser, syncRoleAfterForbidden]);

  /*
    Multiple tabs on the same session.

    The access token is in-memory per tab (see tokenStorage in http.ts), so
    each tab's React state is already its own copy with nothing shared to go
    stale — but nothing tells a second tab that the person clicked Logout in
    the first one, or signed in again there after being bounced out. This
    listens for that broadcast (see `broadcastAuthEvent` above) and reacts:
    'signed-out' clears local state immediately instead of waiting for this
    tab's next request to 401; 'signed-in' re-runs this tab's own refresh so
    it picks up the new session the same way a fresh page load would.
  */
  useStorageSync(
    AUTH_BROADCAST_KEY,
    useCallback(
      (raw) => {
        if (env.demoMode || !raw) return;
        try {
          const { kind } = JSON.parse(raw) as { kind?: string };
          if (kind === 'signed-out') {
            setToken(null);
            setUser(null);
          } else if (kind === 'signed-in') {
            void reloadUser();
          }
        } catch {
          // Malformed broadcast — ignore it rather than guess.
        }
      },
      [reloadUser],
    ),
  );

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