// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider, useLocale } from './LocaleContext';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.doUnmock('@/config/env');
});

function Harness() {
  const { lang } = useLocale();
  return <span>lang:{lang}</span>;
}

/*
  `LocaleProvider` sits above `AppErrorBoundary` in main.tsx (it has to — the
  boundary itself needs a locale to render its own fallback in). A `throw`
  anywhere in here during the first render is not caught by anything and
  produces a blank page, not the app's error screen. Private browsing modes
  that block storage entirely (and any storage blocked by policy or an
  extension) throw on ordinary get/setItem calls, so this has to survive them.
*/
describe('LocaleProvider with storage unavailable', () => {
  it('still renders when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() =>
      render(
        <LocaleProvider>
          <Harness />
        </LocaleProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByText('lang:en')).toBeInTheDocument();
  });

  it('still renders when localStorage.getItem throws, with Arabic enabled (the only path that reads storage)', async () => {
    // `resolveInitialLang` short-circuits to 'en' without touching storage
    // unless Arabic is enabled — mock the flag so this test actually reaches
    // the `getItem` call it means to guard.
    vi.doMock('@/config/env', () => ({ env: { arabicEnabled: true } }));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    const { LocaleProvider: MockedLocaleProvider, useLocale: useMockedLocale } = await import('./LocaleContext');
    function MockedHarness() {
      const { lang } = useMockedLocale();
      return <span>lang:{lang}</span>;
    }

    expect(() =>
      render(
        <MockedLocaleProvider>
          <MockedHarness />
        </MockedLocaleProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByText('lang:en')).toBeInTheDocument();
  });
});
