import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/*
  Unit and integration tests. Same aliases and plugins as the app; the
  Playwright suites under e2e/ have their own runner and are left out here.
*/
export default mergeConfig(
  viteConfig({ mode: 'test', command: 'serve' }),
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, 'e2e/**'],
      /*
        The unit tests exercise the real code paths: auth, refresh, roles and
        the HTTP services, through fake adapters. Demo mode would replace
        them, and Vitest reads .env and the shell, so a developer with
        VITE_DEMO_MODE=true had 80 tests fail (N-18). Pinned off here.
      */
      env: { VITE_DEMO_MODE: 'false' },
    },
  }),
);
