import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/*
  Lint for a Vite + React + TypeScript app.

  `tsc --noEmit` already owns type correctness, so this config sticks to what
  the compiler cannot see: the rules of hooks, stale effect dependencies,
  unused code and a handful of correctness rules from the recommended sets.
*/
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'e2e/.artifacts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Fast refresh keeps state only for files that export components alone.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // `_name` marks an intentionally unused binding (a destructured field being dropped).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Node-side files: Playwright specs and config, Vite config.
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);
