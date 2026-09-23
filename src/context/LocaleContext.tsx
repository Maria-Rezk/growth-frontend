import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { env } from '@/config/env';
import { messages, type AppLanguage } from '@/i18n/messages';

type Direction = 'ltr' | 'rtl';

interface LocaleContextValue {
  lang: AppLanguage;
  dir: Direction;
  setLang: (lang: AppLanguage) => void;
  toggle: () => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const LANG_KEY = 'growth.lang';

function resolveInitialLang(): AppLanguage {
  // A stored 'ar' from before the flag is not honoured while Arabic is off.
  if (!env.arabicEnabled) return 'en';
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    return stored === 'ar' || stored === 'en' ? stored : 'en';
  } catch {
    // Private browsing / storage disabled. This runs during the very first
    // render, above AppErrorBoundary in main.tsx — left unguarded, a browser
    // that blocks storage entirely would throw here before any error
    // boundary exists to catch it, producing a blank page instead of an app.
    return 'en';
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(resolveInitialLang);
  const dir: Direction = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Preference is still honoured for this session.
    }
  }, [lang, dir]);

  const setLang = useCallback((next: AppLanguage) => setLangState(next), []);
  const toggle = useCallback(() => setLangState((current) => (current === 'en' ? 'ar' : 'en')), []);

  const t = useCallback(
    (key: string) => messages[lang][key] ?? messages.en[key] ?? key,
    [lang],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ lang, dir, setLang, toggle, t }),
    [lang, dir, setLang, toggle, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider.');
  return context;
}