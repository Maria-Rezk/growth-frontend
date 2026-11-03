# Solu1ions Growth Platform — frontend

The web app for the Solu1ions Growth Platform: content plans and posts, the approval workflow, leads, tasks, campaigns, reports and notifications, for agency staff and for their clients.

React 18, TypeScript (strict), Vite 5, React Router 6, TanStack Query 5, React Hook Form with Zod, axios. Unit tests use Vitest with Testing Library; end-to-end and accessibility tests use Playwright with axe-core.

## Requirements

- Node.js 18 or newer, and npm.
- Google Chrome, for the Playwright suites only. They drive the installed Chrome (`channel: 'chrome'`), so no Playwright browser download is needed.

## Setup

```bash
npm ci
```

`npm ci` installs exactly what `package-lock.json` records. `.npmrc` pins the public npm registry. Keep the lockfile: it is what makes every install, local and CI, the same.

Then start the dev server:

```bash
npm run dev
```

The dev server runs on http://localhost:5173.

## Environment

Vite reads `VITE_*` variables from these files. Later files override earlier ones:

| File | Tracked | Used by | Purpose |
|---|---|---|---|
| `.env` | no | dev and build | Your own values. Start from `.env.example`. |
| `.env.development` | yes | `npm run dev` only | Safe dev defaults: a **local** API at `http://localhost:3000/api`, no proxy. |
| `.env.development.local` | no | `npm run dev` only | Your dev overrides, such as demo mode or a staging API. |
| `.env.production` / `.env.production.local` | no | `npm run build` only | Production values, if you keep them in files. |

To create your own `.env`, copy the example:

```bash
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | The API, including its `/api` prefix. Use `/api` when the dev proxy is on. |
| `VITE_DEV_PROXY_TARGET` | empty | Dev only. When set, Vite forwards `/api` to this host server-side. This avoids CORS for a remote **staging** API, because the refresh token is an httpOnly cookie and every request is credentialed. |
| `VITE_DEMO_MODE` | `false` | `true` runs the whole app on in-memory sample data, with no backend and no sign-in. |
| `VITE_ENABLE_ARABIC` | `false` | Shows the language toggle. Only the navigation is translated so far. |
| `VITE_API_TIMEOUT_MS` | `25000` | Request timeout. Must be 1000 or more. |
| `VITE_APP_NAME` | `Solu1ions — Business Development` | The text after the page name in the browser tab. |

Restart `npm run dev` after changing any of these.

### Local development never uses production data by default

`.env.development` points `npm run dev` at a local API. To work against a deployed API on purpose, use **staging**: put the override in a git-ignored `.env.development.local`:

```env
VITE_API_BASE_URL=/api
VITE_DEV_PROXY_TARGET=https://staging-api.example.com
```

A dev build that reaches the production API, directly or through the proxy, shows a red "PRODUCTION API" ribbon on every page (`DevApiWarning`).

### Demo mode: the app without a backend

For design review, or for working on the UI without an API, add this to `.env.development.local`:

```env
VITE_DEMO_MODE=true
```

You are signed in as a demo platform admin with every permission. The data lives in memory (`src/services/demoStore.ts`), so a full page reload starts over. Demo mode proves the screens and flows work, not that they match the real API. Demo mode currently ships in the production bundle too (audit finding F-06), so a production build must leave `VITE_DEMO_MODE` unset or `false`.

## Authentication

- **Access token:** kept in memory only (`src/lib/http.ts`), never in browser storage.
- **Staying signed in:** comes from the API's httpOnly refresh cookie. On every load the app exchanges the cookie for a fresh access token, and a 401 triggers one silent refresh before the user is signed out.
- **Cookies in production:** the deployed origin must be in the API's CORS allow-list, with credentials allowed.
- **Across tabs:** signing in or out in one tab is noticed by the others through a `localStorage` signal that carries no secret.
- **Roles:** come from `GET /me/memberships` and decide what each person sees.
- **Route guards:** an agency page sends a client-side user to Home, and the admin pages require a platform admin. These guards are cosmetic; the API enforces the real rules. `qa/route-matrix.md` lists who can reach each route.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload. |
| `npm run build` | Type-checks the app, then builds it for production into `dist/`. |
| `npm run preview` | Serves the production build locally. |
| `npm run lint` | ESLint. Fails on any error **or warning**. |
| `npm run typecheck` | TypeScript for the app (`tsconfig.json`) and for the configs and Playwright specs (`tsconfig.node.json`). |
| `npm run test` / `npm run test:run` | Vitest unit and integration tests: watch mode, or a single run. |
| `npm run e2e` | Playwright end-to-end tests. They start their own demo-mode server on port 5175. |
| `npm run e2e:a11y` | The axe-core accessibility audit: every route, dialog and overlay, in light and dark, at 1440 and 375 px. It takes 15 to 40 minutes, so it is a separate gate. |
| `npm run e2e:evidence` | Screenshots of the key pages, and regenerates `qa/route-matrix.md`. |
| `npm run e2e:live` | Read-only checks against a real **staging** deployment. Needs `E2E_LIVE_BASE_URL`, `E2E_LIVE_EMAIL` and `E2E_LIVE_PASSWORD`. |

Before a change is done, run `lint`, `typecheck`, `test:run`, `e2e` and `build`; also run `e2e:a11y` for anything visible. `qa/README.md` describes each gate in detail.

## Project layout

```txt
src/
  main.tsx, App.tsx      app entry and the route table
  config/                env, the API route map (apiRoutes.ts), app routes
  lib/                   http client and token handling, query client, storage, forms
  services/              one module per API area; demoStore.ts holds the demo data
  context/               auth, client (company), notifications, theme, locale
                         (XContext.ts: the context and its hook; XProvider.tsx: the provider)
  hooks/                 data, permission, form-draft and focus hooks
  components/
    ui/                  shared primitives: Button, Fields, Modal, DataTable, State, icons…
    layout/              shell, sidebar, topbar, route guards, command palette
    domain/              feature components (posts, tasks, leads, attachments, calendar…)
    admin/               platform-admin widgets
    notifications/       the bell panel and the notifications page parts
  pages/                 one component per route
  types/domain.ts        API types and shared constants
  utils/                 formatting, permissions, roles and other pure helpers
  styles/global.css      the stylesheet, with design tokens at the top
e2e/demo/                Playwright suites against demo mode
e2e/live/                read-only suite against a real deployment
docs/                    audit and backend-contract notes
qa/                      quality gates, route matrix, evidence screenshots (git-ignored)
```

### Talking to the API

- **Endpoints:** every path is in `src/config/apiRoutes.ts`. Change it there if the backend renames an endpoint.
- **Response unwrapping:** API responses are unwrapped in one place, `unwrap()` in `src/lib/http.ts`. Change that if the envelope changes.
- **Documentation:** the current contract and its open questions are in `docs/backend-contract-audit.md` and `docs/frontend-contract-status.md`.

## Before launch

Run the live suite against staging (`npm run e2e:live`), then check with real accounts:
1. Sign in as each role, as a staff member and as a client.
2. Run the approval flows across roles.
3. Upload attachments.
4. Let a session expire, and check the refresh.
5. Check CORS from the deployed origin.

`docs/frontend-audit-2026-10-28.md` tracks what is verified and what is still open.

## Troubleshooting

- **npm uses the wrong registry.** `.npmrc` already pins `https://registry.npmjs.org/`. Check that a user-level `npm config` is not overriding it, then run `npm ci` again.
- **Windows cannot remove `node_modules`.** `npm ci` empties `node_modules` before installing, even with `--dry-run`, and on Windows a running dev server or test run holds files there open. Stop them, and any editor or terminal using the folder, then run `npm ci` again. Deleting the lockfile does not fix install problems; it hides them.
- **The dev server stops with `EBUSY`.** Vite ignores `e2e/.artifacts` and `qa/screenshots` for exactly this. If it still happens, restart `npm run dev`.
