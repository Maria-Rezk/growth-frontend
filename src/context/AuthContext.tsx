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
import { queryClient } from '@/lib/queryClient';
import { demoUser as DEMO_USER } from '@/services/demoStore';
import type { AuthResponse, LoginRequest, Membership, User } from '@/types/domain';

/**
 * Splits `/auth/me` into the user and the memberships it carries. `null`
 * memberships means the API did not send any (as opposed to an empty list,
 * which means "a member of nothing") — the distinction decides where company
 * roles come from, see CompanyContext.
 */
function splitMe(me: User & { memberships?: Membership[] }): { user: User; memberships: Membership[] | null } {
  const { memberships, ...user } = me;
  return { user, memberships: Array.isArray(memberships) ? memberships : null };
}

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
  /**
   * The signed-in person's own memberships, straight from `/auth/me` — the one
   * source of company roles that every member is allowed to read. `null` when
   * the API did not include them.
   */
  sessionMemberships: Membership[] | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<boolean>;
  acceptInvitation: (payload: { token: string; fullName?: string; password?: string }) => Promise<AcceptResult>;
  logout: () => void;
  reloadUser: (options?: { silent?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => (env.demoMode ? DEMO_USER : null));
  const [sessionMemberships, setSessionMemberships] = useState<Membership[] | null>(null);
  const [token, setToken] = useState<string | null>(() => (env.demoMode ? 'demo-token' : tokenStorage.get()));
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);

  /*
    Server state belongs to one person. Posts, tasks, members and notifications
    are cached for minutes, so without this the next person to sign in on a
    shared computer — or the same tab after a session expired — would be shown
    the previous person's data until each query went stale. Cleared whenever
    the signed-in identity changes or ends; a silent refresh for the same
    person keeps the cache.
  */
  const cachedFor = useRef<string | null>(null);
  const adoptIdentity = useCallback((nextUserId: string | null) => {
    if (cachedFor.current !== nextUserId) queryClient.clear();
    cachedFor.current = nextUserId;
  }, []);

  /** Takes a freshly read `/auth/me` as the session's truth: identity, user and memberships together. */
  const adoptSession = useCallback((me: User & { memberships?: Membership[] }) => {
    const next = splitMe(me);
    adoptIdentity(next.user.id);
    setUser(next.user);
    setSessionMemberships(next.memberships);
  }, [adoptIdentity]);

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
    adoptIdentity(null);
    setToken(null);
    setUser(null);
    setSessionMemberships(null);
  }, [adoptIdentity]);

  /** The person's own "Logout" action: revoke the session, not just forget it locally, and tell other tabs. */
  const logout = useCallback(() => {
    clearSession();
    if (env.demoMode) return;
    void authService.logout();
    broadcastAuthEvent('signed-out');
  }, [clearSession]);

  const applyAuth = useCallback(
    async (auth: AuthResponse) => {
      tokenStorage.set(auth.accessToken);
      /*
        The login response is not relied on for memberships: the session's roles
        come from `/auth/me`, read once here so the app never renders signed in
        with roles still unknown. If that read fails the person is still signed
        in, with no company roles — which fails closed.
      */
      let me: User & { memberships?: Membership[] } = auth.user;
      try {
        me = await authService.me();
      } catch {
        // keep the login response's user
      }
      adoptSession(me);
      setToken(auth.accessToken);
      if (!env.demoMode) broadcastAuthEvent('signed-in');
    },
    [adoptSession],
  );

  /** `silent` re-checks the session without blanking the screen — for a background signal, not a page load. */
  const reloadUser = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
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
        adoptIdentity(null);
        setToken(null);
        setUser(null);
        setSessionMemberships(null);
        return;
      }
      adoptSession(await authService.me());
      setToken(refreshedToken);
    } catch (err) {
      clearSession();
      setError(err instanceof Error ? err.message : 'Could not restore session.');
    } finally {
      setLoading(false);
    }
  }, [adoptIdentity, adoptSession, clearSession]);

  /*
    A role that changed mid-session.

    A 403 means "signed in, not allowed" — an authorization answer, not an
    expired credential, so it never touches the refresh cookie (401 owns that,
    see http.ts). It only prompts a quiet re-read of `/auth/me`, so a role
    changed elsewhere reaches the UI and the controls it no longer allows
    disappear. A role that simply lacks access gets the same 403 on every visit,
    so the re-read is throttled and single-flight: a dashboard of independent
    widgets that all 403 together costs one request, once a minute at most.
  */
  const syncingRole = useRef(false);
  const lastRoleSync = useRef(0);
  /*
    At most once a minute.
  */
  const ROLE_SYNC_MIN_INTERVAL_MS = 60_000;

  const syncRoleAfterForbidden = useCallback(async () => {
    if (syncingRole.current || !tokenStorage.get()) return;
    if (Date.now() - lastRoleSync.current < ROLE_SYNC_MIN_INTERVAL_MS) return;
    lastRoleSync.current = Date.now();
    syncingRole.current = true;
    try {
      adoptSession(await authService.me());
    } catch {
      // A 401 on the re-read already signed the user out through the
      // unauthorized handler; anything else leaves the session as it was.
    } finally {
      syncingRole.current = false;
    }
  }, [adoptSession]);

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
      adoptIdentity(refreshedUser.id);
      setToken(tokenStorage.get());
      setUser(refreshedUser);
    });
    void reloadUser();
    return () => {
      setUnauthorizedHandler(null);
      setForbiddenHandler(null);
      setSessionRefreshedHandler(null);
    };
  }, [adoptIdentity, clearSession, reloadUser, syncRoleAfterForbidden]);

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
            adoptIdentity(null);
            setToken(null);
            setUser(null);
            setSessionMemberships(null);
          } else if (kind === 'signed-in') {
            void reloadUser({ silent: true });
          }
        } catch {
          // Malformed broadcast — ignore it rather than guess.
        }
      },
      [adoptIdentity, reloadUser],
    ),
  );

  const login = useCallback(
    async (payload: LoginRequest) => {
      setError(null);
      try {
        await applyAuth(await authService.login(payload));
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
            await applyAuth(await authService.login({ email, password: payload.password }));
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
      sessionMemberships,
      token,
      loading,
      error,
      isAuthenticated: Boolean(token && user),
      login,
      acceptInvitation,
      logout,
      reloadUser,
    }),
    [acceptInvitation, error, loading, login, logout, reloadUser, sessionMemberships, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}