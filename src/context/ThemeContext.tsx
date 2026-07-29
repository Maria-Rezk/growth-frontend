import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** What the user chose. `system` defers to the OS setting. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What is actually painted. `system` is always resolved to one of these. */
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** The user's stored choice, including `system`. */
  preference: ThemePreference;
  /** The concrete theme currently applied to <html>. Never `system`. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light → dark → system → light. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Must stay in sync with the boot script in index.html. */
export const THEME_STORAGE_KEY = 'growth.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const CYCLE: ThemePreference[] = ['light', 'dark', 'system'];

/** Background colours mirrored into <meta name="theme-color"> per theme. */
const META_THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f7f8f9',
  dark: '#0e1116',
};

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    // Private browsing / storage disabled — fall back to the OS setting.
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredPreference()));

  // Re-resolve whenever the stored preference changes.
  useEffect(() => {
    setTheme(resolveTheme(preference));
  }, [preference]);

  // Follow the OS live, but only while the user is on `system`.
  useEffect(() => {
    if (preference !== 'system') return;

    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setTheme(event.matches ? 'dark' : 'light');

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  // Apply to the document. The stylesheet only ever branches on data-theme,
  // so `system` never reaches CSS.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_THEME_COLOR[theme]);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference is still honoured for this session.
    }
  }, []);

  const cycle = useCallback(() => {
    setPreference(CYCLE[(CYCLE.indexOf(preference) + 1) % CYCLE.length]);
  }, [preference, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference, cycle }),
    [preference, theme, setPreference, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
