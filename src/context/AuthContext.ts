import { createContext, useContext } from 'react';
import type { LoginRequest, User } from '@/types/domain';

/*
  The auth context and its hook, apart from AuthProvider (F-31): a
  module that exports only components keeps its state across Fast Refresh.
  Everything that reads the context imports from here, as before.
*/

/** What accepting an invitation did: accepted at all, and signed in by it. */
export type AcceptResult = { accepted: boolean; authenticated: boolean };

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<boolean>;
  acceptInvitation: (payload: { token: string; fullName?: string; password?: string }) => Promise<AcceptResult>;
  logout: () => void;
  reloadUser: (options?: { silent?: boolean }) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
