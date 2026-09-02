import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { companiesService } from '@/services/companies';
import { env } from '@/config/env';
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
  currentMembership: Membership | null;
  hasRole: (...roles: CompanyMembershipRole[]) => boolean;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);
const ACTIVE_COMPANY_KEY = 'growth.activeCompanyId';


export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>(() => (env.demoMode ? [demoCompany] : []));
  const [memberships, setMemberships] = useState<Membership[]>(() => (env.demoMode ? demoMemberships : []));
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(() =>
    env.demoMode ? demoCompany.id : window.localStorage.getItem(ACTIVE_COMPANY_KEY),
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
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, nextActiveId);
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

  const setActiveCompanyId = useCallback((companyId: string) => {
    setActiveCompanyIdState(companyId);

    if (env.demoMode) {
      setMemberships(demoMemberships);
      return;
    }

    window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
    void companiesService.members(companyId).then(setMemberships).catch(() => setMemberships([]));
  }, []);

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
      currentMembership,
      hasRole,
    }),
    [activeCompany, activeCompanyId, companies, currentMembership, error, hasRole, loading, memberships, refreshCompanies, setActiveCompanyId],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used inside CompanyProvider.');
  return context;
}
