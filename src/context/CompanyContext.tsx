import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { companiesService } from '@/services/companies';
import { membershipsService } from '@/services/memberships';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import { useAsync } from '@/hooks/useAsync';
import { useStorageSync } from '@/hooks/useStorageSync';
import { queryKeys } from '@/lib/queryClient';
import { demoCompany, demoMemberships } from '@/services/demoStore';
import { isPlatformAdmin, type Company, type CompanyMembershipRole, type SessionMembership } from '@/types/domain';
import { sortByName } from '@/utils/sort';
import { membershipRoles } from '@/utils/roles';

interface CompanyContextValue {
  /** The clients this person can reach: everything for a platform admin, their ACTIVE memberships otherwise. */
  companies: Company[];
  /** The signed-in person's own ACTIVE memberships. Never anybody else's. */
  memberships: SessionMembership[];
  activeCompany: Company | null;
  activeCompanyId: string | null;
  /** True until the client list, and (for anyone but a platform admin) the person's memberships, are known. */
  loading: boolean;
  error: string | null;
  setActiveCompanyId: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  /** Re-reads the person's memberships (`GET /me/memberships`), the only place roles come from. */
  refreshMemberships: () => Promise<void>;
  /**
   * True when the memberships could not be read, so this person's roles are
   * unknown and every role-gated control is hidden. Not the same as having no
   * roles: a platform admin legitimately has none and still passes every check.
   */
  rolesUnavailable: boolean;
  /**
   * Why: `unsupported` when the server has no `/me/memberships` at all (a 404 —
   * retrying cannot help, it needs a backend release), `failed` for anything
   * transient. Null while roles are known.
   */
  rolesUnavailableReason: 'unsupported' | 'failed' | null;
  currentMembership: SessionMembership | null;
  hasRole: (...roles: CompanyMembershipRole[]) => boolean;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);
const ACTIVE_COMPANY_KEY = 'growth.activeCompanyId';

function readActiveCompanyId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_COMPANY_KEY);
  } catch {
    // Private browsing / storage disabled — the app still works, it just
    // re-resolves the active client from the companies list on every load.
    return null;
  }
}

function writeActiveCompanyId(companyId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
  } catch {
    // Selection is still honoured for this session.
  }
}

const DEMO_COMPANY_DATA = { list: [demoCompany], error: null as string | null };
const DEMO_MEMBERSHIPS: SessionMembership[] = demoMemberships.map((membership) => ({
  id: membership.id,
  companyId: membership.companyId,
  roles: membershipRoles(membership),
  status: membership.status,
}));

/*
  Where a person's roles on a client come from — the architecture in one place.

    /auth/me          ->  who is signed in (AuthContext; knows nothing about clients)
    /companies        ->  which clients to list
    /me/memberships   ->  this person's roles, per client

    selected client + this person's membership for it  ->  roles  ->  can(permission)

  `/me/memberships` returns the signed-in person's own ACTIVE memberships
  (suspended and invited ones are absent) with their effective roles, and every
  authenticated user may call it. The roles for a client are the roles on the
  membership for that client, derived synchronously from the selected client, so
  switching client can never briefly carry the previous client's roles. No
  membership for the selected client means no roles.

  The memberships are cached under a key that includes the person, and the
  whole cache is dropped when the signed-in identity changes (see AuthContext).
  The member directory (`GET /companies/:id/members`) is for managing people;
  nothing here reads it.

  Platform admins pass company checks in the API without belonging to the
  client, so their gates do not read roles at all (see usePermission) and no
  membership is invented for them.
*/
export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const admin = isPlatformAdmin(user?.platformRole);

  // The person's own roles. Keyed by person; a different person is a different query, never the previous one's data.
  const membershipsQuery = useAsync(
    () => membershipsService.mine(),
    [userId],
    { queryKey: queryKeys.myMemberships(userId), enabled: !env.demoMode && Boolean(userId) },
  );
  const loadedMemberships = membershipsQuery.data;

  const [storedActiveId, setStoredActiveId] = useState<string | null>(() =>
    env.demoMode ? demoCompany.id : readActiveCompanyId(),
  );

  // ---- the client list ---------------------------------------------------------------------
  /** Tagged with the person it was loaded for, so one person's clients are never shown to the next. */
  const [loaded, setLoaded] = useState<{ userId: string; list: Company[]; error: string | null } | null>(null);


  const refreshCompanies = useCallback(async () => {
    if (env.demoMode || !userId) return;
    try {
      const list = sortByName(await companiesService.list(), (company) => company.name);
      setLoaded({ userId, list, error: null });
    } catch (err) {
      setLoaded({ userId, list: [], error: err instanceof Error ? err.message : 'Could not load clients.' });
    }
  }, [userId]);

  useEffect(() => {
    void refreshCompanies();
  }, [refreshCompanies]);

  /*
    Reload the list when the set of clients the person is active on changes after it was first
    known (access gained or removed), not whenever the memberships are re-read: the same clients
    with different roles must not refetch. A platform admin's list does not depend on memberships.
  */
  const reachableKey = admin || !loadedMemberships ? null : loadedMemberships.map((membership) => membership.companyId).sort().join(',');
  const seenReachable = useRef<{ userId: string | null; key: string } | null>(null);
  useEffect(() => {
    if (reachableKey === null) return;
    const seen = seenReachable.current;
    if (seen && seen.userId === userId && seen.key !== reachableKey) void refreshCompanies();
    seenReachable.current = { userId, key: reachableKey };
  }, [reachableKey, refreshCompanies, userId]);

  const companyData = env.demoMode ? DEMO_COMPANY_DATA : loaded?.userId === userId ? loaded : null;
  const companies = useMemo(() => companyData?.list ?? [], [companyData]);

  // The active client is the stored choice if this person can still reach it, otherwise their first.
  const activeCompanyId = useMemo(() => {
    if (!companyData) return null;
    return storedActiveId && companies.some((company) => company.id === storedActiveId) ? storedActiveId : companies[0]?.id ?? null;
  }, [companies, companyData, storedActiveId]);

  useEffect(() => {
    if (!env.demoMode && activeCompanyId) writeActiveCompanyId(activeCompanyId);
  }, [activeCompanyId]);

  const setActiveCompanyId = useCallback((companyId: string) => {
    setStoredActiveId(companyId);
    if (!env.demoMode) writeActiveCompanyId(companyId);
  }, []);

  /*
    Switching the active client in one tab (the sidebar switcher) is a change
    someone made on purpose; every other open tab on this session should
    follow it rather than keep showing — and letting the person act on — a
    workspace they just navigated away from elsewhere.
  */
  useStorageSync(
    ACTIVE_COMPANY_KEY,
    useCallback((newValue) => {
      if (env.demoMode || !newValue) return;
      setStoredActiveId(newValue);
    }, []),
  );

  // ---- roles -------------------------------------------------------------------------------
  // The backend returns ACTIVE memberships only; anything else is ignored rather than trusted.
  const memberships = useMemo<SessionMembership[]>(
    () => (env.demoMode ? DEMO_MEMBERSHIPS : (loadedMemberships ?? []).filter((membership) => membership.status === 'ACTIVE')),
    [loadedMemberships],
  );

  /*
    Roles that are not loaded, and not being loaded, are unknown, not empty: no permissions and a notice
    with a retry. Keyed on "not loaded and not loading" rather than on an error, so it also holds while a
    retry is paused (a hidden tab, being offline) and before the first failure has been reported.
  */
  const rolesUnavailable = !env.demoMode && !admin && Boolean(userId) && loadedMemberships === null && !membershipsQuery.loading;
  const rolesUnavailableReason = !rolesUnavailable ? null : membershipsQuery.errorStatus === 404 ? 'unsupported' : 'failed';
  const { refetch: refetchMemberships } = membershipsQuery;

  const refreshMemberships = useCallback(async () => {
    if (!env.demoMode) await refetchMemberships();
  }, [refetchMemberships]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [activeCompanyId, companies],
  );

  const currentMembership = useMemo(
    () => (activeCompanyId ? memberships.find((membership) => membership.companyId === activeCompanyId) ?? null : null),
    [activeCompanyId, memberships],
  );

  const hasRole = useCallback(
    (...roles: CompanyMembershipRole[]) => {
      if (!roles.length) return true;
      // Any of their roles on this client satisfies the check, the same way the API decides it.
      return membershipRoles(currentMembership).some((role) => roles.includes(role));
    },
    [currentMembership],
  );

  // A client-only person must not see the agency app while their roles are still on the way, so everyone but an admin waits.
  const rolesLoading = !env.demoMode && !admin && Boolean(userId) && membershipsQuery.loading;
  const loading = (!env.demoMode && companyData === null) || rolesLoading;

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      memberships,
      activeCompany,
      activeCompanyId,
      loading,
      error: companyData?.error ?? null,
      setActiveCompanyId,
      refreshCompanies,
      refreshMemberships,
      rolesUnavailable,
      rolesUnavailableReason,
      currentMembership,
      hasRole,
    }),
    [activeCompany, activeCompanyId, companies, companyData, currentMembership, hasRole, loading, memberships, refreshCompanies, refreshMemberships, rolesUnavailable, rolesUnavailableReason, setActiveCompanyId],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used inside CompanyProvider.');
  return context;
}
