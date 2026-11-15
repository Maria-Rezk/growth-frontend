import { createContext, useContext } from 'react';
import type { Company, CompanyMembershipRole, SessionMembership } from '@/types/domain';

/*
  The company context and its hook, apart from CompanyProvider (F-31): a
  module that exports only components keeps its state across Fast Refresh.
  Everything that reads the context imports from here, as before.
*/

export interface CompanyContextValue {
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

export const CompanyContext = createContext<CompanyContextValue | null>(null);

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used inside CompanyProvider.');
  return context;
}
