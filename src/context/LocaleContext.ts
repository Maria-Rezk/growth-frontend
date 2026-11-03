import { createContext, useContext } from 'react';
import type { AppLanguage } from '@/i18n/messages';

/*
  The locale context and its hook, apart from LocaleProvider (F-31): a
  module that exports only components keeps its state across Fast Refresh.
  Everything that reads the context imports from here, as before.
*/

export type Direction = 'ltr' | 'rtl';

export interface LocaleContextValue {
  lang: AppLanguage;
  dir: Direction;
  setLang: (lang: AppLanguage) => void;
  toggle: () => void;
  t: (key: string) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider.');
  return context;
}
