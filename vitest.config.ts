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
    },
  }),
);
