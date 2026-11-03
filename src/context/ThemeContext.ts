import { createContext, useContext } from 'react';

/*
  The theme context and its hook, apart from ThemeProvider (F-31): a
  module that exports only components keeps its state across Fast Refresh.
  Everything that reads the context imports from here, as before.
*/

/** What the user chose. `system` defers to the OS setting. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What is actually painted. `system` is always resolved to one of these. */
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  /** The user's stored choice, including `system`. */
  preference: ThemePreference;
  /** The concrete theme currently applied to <html>. Never `system`. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light → dark → system → light. */
  cycle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
