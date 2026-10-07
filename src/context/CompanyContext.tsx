import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { companiesService } from '@/services/companies';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import { useStorageSync } from '@/hooks/useStorageSync';
import { demoCompany, demoMemberships } from '@/services/demoStore';
import { isPlatformAdmin, type Company, type CompanyMembershipRole, type Membership } from '@/types/domain';
import { sortByName } from '@/utils/sort';
import { membershipRoles } from '@/utils/roles';

interface CompanyContextValue {
  companies: Company[];
  /** The signed-in person's own memberships (every status). Never somebody else's. */
  memberships: Membership[];
  activeCompany: Company | null;
  activeCompanyId: string | null;
  /** True until both the client list and the person's roles on the active client are known. */
  loading: boolean;
  error: string | null;
  setActiveCompanyId: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
  /**
   * True when this person's roles on the active client could not be determined,
   * so every role-gated control is hidden. Distinct from "has no roles": the
   * screens say so instead of looking empty. Only possible when the session
   * carries no memberships (see below).
   */
  rolesUnavailable: boolean;
  currentMembership: Membership | null;
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

/** Which person a loaded list belongs to, so one person's data is never shown to the next. */
type Loaded<T> = { userId: string | null; value: T };

/*
  Where company roles come from — the architecture in one place.

  1. SESSION MEMBERSHIPS (preferred). `/auth/me` returns the signed-in person's
     own memberships, and every member may call it. From those:
       - a client's roles are the roles on the ACTIVE membership for that client;
       - a non-admin's client list is exactly their ACTIVE memberships (a
         suspended one does not appear);
     and both are derived synchronously from the selected client, so switching
     client can never briefly inherit the previous client's roles.

  2. MEMBER DIRECTORY (fallback, only if `/auth/me` carries no memberships).
     `GET /companies/:id/members` is Account Manager / admin only in the API,
     so any other role is refused. That is a gap in the contract, not something
     to paper over: the roles are then unknown, and unknown means NO
     permissions (`rolesUnavailable`), never a guess.

  Platform admins bypass company checks in the API, so their gates do not read
  roles at all (see usePermission); they still get a client list from
  `GET /companies`, which admins may call.
*/
export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, sessionMemberships: sessionFromAuth, reloadUser } = useAuth();
  const userId = user?.id ?? null;
  const admin = isPlatformAdmin(user?.platformRole);
  const sessionMemberships = sessionFromAuth ?? null;
  const sessionMode = !env.demoMode && sessionMemberships !== null;

  const [storedActiveId, setStoredActiveId] = useState<string | null>(() =>
    env.demoMode ? demoCompany.id : readActiveCompanyId(),
  );

  // ---- the client list ---------------------------------------------------------------------
  const [companyState, setCompanyState] = useState<Loaded<{ list: Company[]; error: string | null }> | null>(null);

  /*
    The list depends on WHICH clients the person is active on, not on the identity of the memberships
    array: `/auth/me` is re-read after a role change or a 403, and a new array with the same clients
    must not refetch the client list. A ref carries the latest rows; the key decides when to reload.
  */
  const membershipsRef = useRef(sessionMemberships);
  membershipsRef.current = sessionMemberships;
  const reachableKey = sessionMode && !admin
    ? (sessionMemberships ?? []).filter((membership) => membership.status === 'ACTIVE').map((membership) => membership.companyId).sort().join(',')
    : '';

  const loadCompanyList = useCallback(async (): Promise<Company[]> => {
    if (sessionMode && !admin) {
      const active = (membershipsRef.current ?? []).filter((membership) => membership.status === 'ACTIVE');
      const embedded = active.flatMap((membership) => (membership.company ? [membership.company] : []));
      if (embedded.length === active.length) return embedded;
      // The memberships name the clients but not the clients' details: read them, keep only the person's own.
      const ids = new Set(active.map((membership) => membership.companyId));
      return (await companiesService.list()).filter((company) => ids.has(company.id));
    }
    return companiesService.list();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reachableKey` is the dependency for the memberships read through the ref
  }, [admin, reachableKey, sessionMode]);

  const refreshCompanies = useCallback(async () => {
    if (env.demoMode || !userId) return;
    try {
      const list = sortByName(await loadCompanyList(), (company) => company.name);
      setCompanyState({ userId, value: { list, error: null } });
    } catch (err) {
      setCompanyState({ userId, value: { list: [], error: err instanceof Error ? err.message : 'Could not load clients.' } });
    }
  }, [loadCompanyList, userId]);

  useEffect(() => {
    void refreshCompanies();
  }, [refreshCompanies]);

  const companyData = env.demoMode ? DEMO_COMPANY_DATA : companyState?.userId === userId ? companyState.value : null;
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

  // ---- roles: fallback path (no memberships on the session) ---------------------------------
  const [directory, setDirectory] = useState<Loaded<{ companyId: string; rows: Membership[]; unavailable: boolean }> | null>(null);
  const [directoryTick, setDirectoryTick] = useState(0);
  const useDirectory = !env.demoMode && !sessionMode;

  useEffect(() => {
    if (!useDirectory || !userId || !activeCompanyId) return;
    let cancelled = false;
    void (async () => {
      let rows: Membership[] = [];
      let unavailable = false;
      try {
        rows = await companiesService.members(activeCompanyId);
      } catch {
        unavailable = true;
      }
      // A slow answer for a client the person has since left must not overwrite the one they are on.
      if (!cancelled) setDirectory({ userId, value: { companyId: activeCompanyId, rows, unavailable } });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, directoryTick, useDirectory, userId]);

  const directoryForActive = directory?.userId === userId && directory.value.companyId === activeCompanyId ? directory.value : null;

  const memberships = useMemo<Membership[]>(() => {
    const own = (rows: Membership[]) => rows.filter((membership) => membership.userId === userId);
    if (env.demoMode) return own(demoMemberships);
    if (sessionMode) return own(sessionMemberships ?? []);
    return own(directoryForActive?.rows ?? []);
  }, [directoryForActive, sessionMemberships, sessionMode, userId]);

  const rolesUnavailable = useDirectory && !admin && Boolean(directoryForActive?.unavailable);

  const refreshMemberships = useCallback(async () => {
    if (env.demoMode) return;
    if (sessionMode) {
      await reloadUser({ silent: true });
      return;
    }
    setDirectoryTick((tick) => tick + 1);
  }, [reloadUser, sessionMode]);

  // ---- derived -------------------------------------------------------------------------------
  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [activeCompanyId, companies],
  );

  const currentMembership = useMemo(
    () => memberships.find((membership) => membership.companyId === activeCompanyId && membership.status === 'ACTIVE') ?? null,
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

  const clientsLoading = !env.demoMode && companyData === null;
  const rolesLoading = useDirectory && Boolean(activeCompanyId) && directoryForActive === null;
  const loading = clientsLoading || rolesLoading;

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
      currentMembership,
      hasRole,
    }),
    [activeCompany, activeCompanyId, companies, companyData, currentMembership, hasRole, loading, memberships, refreshCompanies, refreshMemberships, rolesUnavailable, setActiveCompanyId],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used inside CompanyProvider.');
  return context;
}
