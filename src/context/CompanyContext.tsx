import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { companiesService } from '@/services/companies';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import { useStorageSync } from '@/hooks/useStorageSync';
import { demoCompany, demoMemberships } from '@/services/demoStore';
import type { Company, CompanyMembershipRole, Membership } from '@/types/domain';
import { sortByName } from '@/utils/sort';
import { membershipRoles } from '@/utils/roles';

interface CompanyContextValue {
  companies: Company[];
  memberships: Membership[];
  activeCompany: Company | null;
  activeCompanyId: string | null;
  loading: boolean;
  error: string | null;
  setActiveCompanyId: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
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

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [companies, setCompanies] = useState<Company[]>(() => (env.demoMode ? [demoCompany] : []));
  /*
    Every membership row of the active client, as the API returns them. The
    signed-in person's own row is what the gates need, and it is derived
    below — `/companies/:id/members` lists everybody, and reading the first
    active row as "mine" showed a Designer the Account Manager's controls.
  */
  const [allMemberships, setMemberships] = useState<Membership[]>(() => (env.demoMode ? demoMemberships : []));
  const memberships = useMemo(
    () => (userId ? allMemberships.filter((membership) => membership.userId === userId) : []),
    [allMemberships, userId],
  );
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(() =>
    env.demoMode ? demoCompany.id : readActiveCompanyId(),
  );
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);

  const refreshCompanies = useCallback(async () => {
    if (env.demoMode) {
      setCompanies([demoCompany]);
      setMemberships(demoMemberships);
      setActiveCompanyIdState(demoCompany.id);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      /*
        Sorted here as well as in the service. This array is what the client
        switcher and every cross-client screen read, so the order is a property
        of the context rather than something inherited from whichever call
        happened to fill it — one place to look when a list comes out wrong.
      */
      const list = sortByName(await companiesService.list(), (company) => company.name);
      setCompanies(list);
      const nextActiveId = activeCompanyId && list.some((company) => company.id === activeCompanyId)
        ? activeCompanyId
        : list[0]?.id ?? null;
      if (nextActiveId) {
        setActiveCompanyIdState(nextActiveId);
        writeActiveCompanyId(nextActiveId);
        try {
          setMemberships(await companiesService.members(nextActiveId));
        } catch {
          setMemberships([]);
        }
      } else {
        setMemberships([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load companies.');
      setCompanies([]);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void refreshCompanies();
  }, [refreshCompanies]);

  /**
   * Re-reads the signed-in user's memberships on the active client.
   *
   * The API decides permissions per request and has no token to refresh, so a
   * role granted now applies on the next click. This state is the one copy
   * that would not notice: `hasRole` and `<RoleGate>` read it, and it is plain
   * React state rather than a query, so invalidating the members query after a
   * role change leaves the gates showing the roles the person had a minute ago.
   */
  const refreshMemberships = useCallback(async () => {
    if (env.demoMode) {
      setMemberships(demoMemberships);
      return;
    }
    if (!activeCompanyId) {
      setMemberships([]);
      return;
    }
    try {
      setMemberships(await companiesService.members(activeCompanyId));
    } catch {
      setMemberships([]);
    }
  }, [activeCompanyId]);

  const setActiveCompanyId = useCallback((companyId: string) => {
    setActiveCompanyIdState(companyId);

    if (env.demoMode) {
      setMemberships(demoMemberships);
      return;
    }

    writeActiveCompanyId(companyId);
    void companiesService.members(companyId).then(setMemberships).catch(() => setMemberships([]));
  }, []);

  /*
    Switching the active client in one tab (the sidebar switcher) is a change
    someone made on purpose; every other open tab on this session should
    follow it rather than keep showing — and letting the person act on — a
    workspace they just navigated away from elsewhere.
  */
  useStorageSync(
    ACTIVE_COMPANY_KEY,
    useCallback(
      (newValue) => {
        if (env.demoMode || !newValue || newValue === activeCompanyId) return;
        setActiveCompanyIdState(newValue);
      },
      [activeCompanyId],
    ),
  );

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
      // Any of their roles on this client satisfies the check, the same way
      // the API decides it.
      const held = membershipRoles(currentMembership);
      return held.some((role) => roles.includes(role));
    },
    [currentMembership],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      memberships,
      activeCompany,
      activeCompanyId,
      loading,
      error,
      setActiveCompanyId,
      refreshCompanies,
      refreshMemberships,
      currentMembership,
      hasRole,
    }),
    [activeCompany, activeCompanyId, companies, currentMembership, error, hasRole, loading, memberships, refreshCompanies, refreshMemberships, setActiveCompanyId],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used inside CompanyProvider.');
  return context;
}
