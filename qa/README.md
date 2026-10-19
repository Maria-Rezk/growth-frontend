# Quality gates and evidence

| Gate | Command | What it proves |
|---|---|---|
| Lint | `npm run lint` | ESLint (flat config, typescript-eslint, React hooks rules). Fails on errors; warnings are reported. |
| Types | `npm run typecheck` | `tsc --noEmit` over `src/`. |
| Unit and integration | `npm run test:run` | Vitest + Testing Library, everything under `src/`. |
| End-to-end (demo) | `npm run e2e` | Playwright against a local server in **demo mode**: in-memory sample data, no backend. |
| Evidence | `npm run e2e:evidence` | Screenshots of the key pages at 1440 and 375 px, plus `qa/route-matrix.md`. |
| End-to-end (live) | `npm run e2e:live` | Playwright against a **real deployment**. Read-only. See below. |
| Build | `npm run build` | Type check, then the production bundle. |

Playwright drives the locally installed Chrome (`channel: 'chrome'`); no browser download is needed.
Reports, traces and failure screenshots land in `e2e/.artifacts/` (git-ignored).
Evidence screenshots land in `qa/screenshots/` (git-ignored; regenerate them any time).

## Demo results are not API results

The demo suite proves the screens and flows work. It does not prove the frontend
and the real API agree. Only the live suite does that.

## Running the live suite

It needs a **staging** deployment and a **disposable test account**. Never point it
at production or use a person's real login. It never creates, edits or deletes data.

```bash
E2E_LIVE_BASE_URL=https://staging.example.com \
E2E_LIVE_EMAIL=qa-account@example.com \
E2E_LIVE_PASSWORD=... \
npm run e2e:live
```

It checks: sign-in, session survives a reload (refresh cookie), sign-out, protected
routes redirect when signed out, a wrong password is refused, and every main page
loads without a 4xx/5xx API response other than 401/403.

## Backend findings (19 October 2026)

Probed without signing in, read-only, against `https://api.solu1ions.tech/api`:

- The API is up. `GET /auth/me` answers `401` JSON without a session.
- All 13 Operations dashboard endpoints exist (`/admin/dashboard/*` and
  `/admin/system/health` answer `401`, while an unknown path answers `404`).
  The dashboard's empty widgets in demo mode come from the demo, which has no
  agency-wide data, not from missing endpoints.
- Not verified: anything behind sign-in. There is no staging URL or test account
  in this project, and the only known API host is the production domain.
