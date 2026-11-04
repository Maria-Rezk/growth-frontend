# Frontend production release v1: readiness report and runbook

**Prepared:** 4 November 2026 · **Branch:** `release/frontend-production-v1` · **Status:** not deployed, not pushed.

This release replaces the frontend at `https://solu1ions.tech`. The backend, database, nginx configuration and API contract do not change.

---

## 1. Release candidate

**Code commit: `2e8486c`** on `release/frontend-production-v1`, built as:

```txt
7b6c3fc  (phase-4b1 history up to the end of step 0)
 + 6bff79b  cherry-pick of ce1139c: calendar tests no longer depend on the date
 + 2e8486c  cherry-pick of 4cbd65a: demo builds need the dedicated target
```

It contains all the UX, accessibility and engineering work through Phase 4A, plus the production hygiene from step 0:
- no demo data or demo-only code in production;
- unit tests pinned to the real code paths;
- a build guard, and `check:demo-free` inside `npm run build`.

**Deliberately excluded:** the demo adapter skeleton (`52de71c`, `57d0a04`) and the Brand Profiles pilot (`phase-4b2-brand-profiles-pilot`). The skeleton makes `main.tsx` start asynchronously and adds a hook to the HTTP client. It is unfinished architecture in the app's start-up path, and leaving it out costs nothing: demo mode works without it, and that work stays on its own branches.

**What this replaces:** the live bundle is `0fd1a49` (`origin/develop`, 25 October), proven by rebuilding it with `VITE_APP_NAME="Solu1ions Growth OS"`: the main chunk is byte-identical (`index-BvTI3Aqb.js`).

**Changes visible to the API since `0fd1a49`:**
- `apiRoutes.ts`: unchanged.
- `lib/http.ts`: the `ngrok-skip-browser-warning` header is no longer sent to production. This removes a header; the backend needs nothing new.
- Services: demo-only code moved or reworded; no production request changed.
- Brand colours are saved as lower-case `#rrggbb` (N-14). The backend's `@IsHexColor()` accepts this.

---

## 2. Hosting and environment, as found

Found by reading public responses. **There is no deployment configuration in this repository**: no Dockerfile, nginx file, CI workflow or hosting file. Server access was not available, so nothing below comes from inside the server.

| Item | Finding | Status |
|---|---|---|
| Frontend domain | `https://solu1ions.tech` and `https://www.solu1ions.tech`, both serving the app | Confirmed |
| Hosting | nginx 1.24.0 on Ubuntu, on `187.127.94.181` | Confirmed from headers and DNS |
| API | `https://api.solu1ions.tech/api`, **on the same server** | Confirmed |
| Web root and deploy method | Unknown | **Must be read from the server** (§7, step 0) |
| Production API URL in the build | `https://api.solu1ions.tech/api`, in one place | Verified in `dist` |
| Vite mode | `production` | Verified |
| Demo mode | Off: flag folded away, no demo content (54 markers). `VITE_DEMO_MODE=true` is refused at build time | Verified |
| Demo authorisation | None exists: only `--mode demo` can build demo mode, and it writes to `dist-demo` | Verified |
| Access token | In memory only, never in browser storage | Verified in code |
| Refresh cookie | `httpOnly`, `Secure`, `SameSite=None`, path `/api/auth`, 30 days; sent with `withCredentials` | Verified in backend source (`task-draft`); not against the running API |
| CORS | Preflight allows `https://solu1ions.tech` and `https://www.solu1ions.tech` with credentials; others get a 500 | Verified live, without credentials |
| HTTPS | HTTP redirects to HTTPS. Let's Encrypt certificate valid until 24 December 2026. HSTS on the API, **not on the frontend** | Verified |
| SPA fallback | Deep links return `index.html` | Verified live |
| Compression | gzip on | Verified live |
| Cache headers | **None on any file**, only ETag and Last-Modified | Verified live; see F-2 |
| Missing asset | **Returns `200 text/html`**, not 404 | Verified live; see F-3 |
| Security headers | None on the frontend (CSP, frame options and others) | Verified live; see F-5 |
| Secrets | None found in the build, no source maps, `.env` holds no secrets | Verified |

**Environment for the production build:**

```env
VITE_API_BASE_URL=https://api.solu1ions.tech/api
VITE_DEMO_MODE=false
VITE_ENABLE_ARABIC=false
VITE_API_TIMEOUT_MS=25000
VITE_APP_NAME=Solu1ions — Business Development
```

The live site uses the older app name, "Solu1ions Growth OS", in the browser tab. This release changes it (F-7).

---

## 3. Compatibility with the production API

**What has been verified, and how:**

| Check | Method | Result |
|---|---|---|
| All 104 frontend paths exist in the backend | Static comparison with `manaf88/CRM-PLATFORM`, branch `task-draft`, 157 routes | All present |
| All 67 frontend GET paths exist on the live API | Unauthenticated GET, stopped by the auth guard | All 401, no 404 |
| `/me/memberships` exists (a blocker on 19 October) | Live and source | 401 live; source returns the bare array `parseMyMemberships` reads |
| Public report route | Live, with a bad token | 404 as expected |
| CORS for the production origins | Live preflight | Allowed, with credentials |
| Cookie settings suit the two hosts | Backend source | Same site, so `SameSite=None; Secure` is sent |
| Request shapes for the audited routes | `docs/backend-contract-audit.md`, plus `backendContract.test` and other unit tests | Match, as of the source read |

**No request in this check signed in, wrote anything, or read customer data.** About 80 unauthenticated `GET` and `OPTIONS` requests were sent, paced, and stopped at the auth guard.

**Not verified: everything behind sign-in on the running API.** No staging environment or test account is available. Demo E2E tests say nothing about this. The following are **unverified against the real API**:

| Critical flow | Why it matters | Evidence so far |
|---|---|---|
| Sign in, session restore, refresh rotation, sign out | Nobody can use the app without it | Unit tests with fake transport; backend source |
| Real `/me/memberships` response per role | Decides what every non-admin can do | Source only |
| Role-based permissions per role | Wrong gates hide or expose actions | Unit tests only; backend enforces the real rule |
| **Client data isolation** | One client must never see another's data | Unit tests only; backend guards read in source |
| Real response shapes across lists | Pages can fail on real data that demo data does not exercise | Partly captured samples in `http.test` |
| Pagination and filters on real data | Demo filtering is not the server's | Audit of DTOs only |
| Uploads | Multipart request and signed download URLs | Not tested anywhere |
| Notifications, task and approval workflows | Daily use | Demo only |
| Which backend commit is deployed | Everything above reads `task-draft` | Unknown |

---

## 4. Findings

### BLOCKER

**B-1. Authenticated behaviour is unverified against the production API.** Per the release criteria, authentication, authorisation, API compatibility and tenant isolation must be verified before approval. They need test accounts, which are not available. Close it with §5.

**B-2. The deployment target is unknown.** The web root, method and access are not in the repository, and nobody has server access in this work. The runbook cannot be executed without them. Close it by giving the deployer access and running §7, step 0.

### HIGH

**F-1. The commits are not on GitHub.** `origin/develop` stops at `0fd1a49`; the release branch is 78 commits ahead of it, all local. Losing this machine loses the release. Pushing needs your approval.

**F-2. No cache headers.** With `Last-Modified` and no `Cache-Control`, browsers may reuse `index.html` for a while by their own heuristics. Some users may keep the old app after the release until it revalidates. Old assets must therefore stay on the server (§7). No nginx change is needed to release safely.

### MEDIUM

**F-3. A missing asset returns `200 text/html`.** The SPA fallback also catches `/assets/*`. A deleted chunk reaches an old tab as HTML. The app's `chunkReload` recovers by reloading once, in both the old and new builds, but only if old assets are kept does this stay rare.

**F-4. Firefox and WebKit were not tested.** Only Chrome and Edge are installed here. Check Safari and Firefox by hand after release, or install Playwright's browsers.

**F-5. No security headers or HSTS on the frontend.** This is the same as today, so the release does not worsen it. A later nginx change needs approval, since nginx is shared with the API.

**F-6. N-22: clearing Brand notes does nothing on the real API.** The form omits the field, and the backend's update ignores an absent field (`brand-profiles.service.ts`: `if (dto.brandNotes !== undefined)`). This is today's behaviour too; the release does not change it.

**F-7. The browser-tab name changes** from "Solu1ions Growth OS" to "Solu1ions — Business Development". Confirm this is wanted.

### LOW

- **N-15:** a private copy of `monthName`.
- **N-16:** one unidentified unit-test failure in 28 runs.
- **Login throttling:** the API allows 5 sign-in attempts a minute, so smoke testers should sign in carefully.
- **`dist` caveat:** build from a clean checkout, so no local `.env.production` changes the result.
- **Certificate:** Let's Encrypt, expires 24 December 2026; renewal is presumably automatic but was not verified.

---

## 5. Closing B-1: authenticated verification

**What is needed from you:**
- Approved **test accounts on test clients**, never real client data: one platform admin; one Account Manager; one Designer or Copywriter; one client reviewer. The roles should be on two different test clients, so isolation can be checked.
- Approval to use them against production, read-only.

**How it runs, before anything is deployed.** The new frontend runs on the tester's machine through the existing dev proxy, so the backend's CORS list needs no change:

```env
# .env.development.local, git-ignored, removed afterwards
VITE_API_BASE_URL=/api
VITE_DEV_PROXY_TARGET=https://api.solu1ions.tech
```

```bash
npm run dev
```

The red "PRODUCTION API" ribbon will show; that is expected. The automated read-only suite then runs against it:

```bash
E2E_LIVE_BASE_URL=http://localhost:5173 E2E_LIVE_EMAIL=<test account> E2E_LIVE_PASSWORD=<password> npm run e2e:live
```

Signing in writes a session on the server, as any sign-in does. Nothing else in this procedure writes.

**Manual read-only checklist, per test account:**
1. Sign in; reload (session restores); wait for or force a refresh; sign out.
2. Non-admin: roles load, with no "We could not confirm your role" notice.
3. Permissions: the expected actions are shown for that role, and none beyond it.
4. **Isolation: a user on client A cannot see client B in the switcher, and opening a client B record by its address shows "not found" or "no access".** A client reviewer never sees agency pages.
5. Lists load on real data: posts, tasks, leads, campaigns, reports, notifications, approvals; paging and filters work.
6. Open an attachment (signed download URL). Do not upload to a real client.
7. No console errors and no unexpected 4xx or 5xx.

**Writes** (uploads, approvals, task changes) can only be tested on a test client, and only with separate approval.

---

## 6. Test results

All run on `release/frontend-production-v1`.

| Gate | Result |
|---|---|
| ESLint | 0 errors, 0 warnings |
| TypeScript | app, configs and E2E specs all pass |
| Unit tests | 460/460 (57 files) |
| Demo E2E | 258/258 in 11.1 min, none skipped, no retries |
| Accessibility | 172/172 in 9.0 min, 0 violations, 0 exceptions |
| Production build and `check:demo-free` | pass; 54 markers, none found |
| Responsive sweep | 49 page × width checks at 320 to 1920 px, no issues |
| Smoke test of the real build, Chrome | 1440 and 375 px: no problems |
| Smoke test of the real build, Edge | 1440 and 375 px: no problems |
| Firefox, WebKit | **Not run**: not installed here (F-4) |
| Live suite (`npm run e2e:live`) | **Not run**: no test account (B-1) |

**The demo E2E and accessibility results say nothing about the real API.**

The smoke test served the real `dist` output and answered every API call inside the browser, so no request reached production. It covered public pages with reload, eight private deep links (each redirects to sign-in and keeps its return address), asset status and types, and the console.

**Production build, inspected:**

| | |
|---|---|
| All JS, raw / gzip / brotli | 850,256 / 290,041 / 253,873 bytes, 64 files, 1.1 MB on disk |
| Main chunk, raw / gzip | 138,519 / 45,514 bytes |
| API address | `https://api.solu1ions.tech/api`, in one place; no local or tunnel address |
| Demo | `VITE_DEMO_MODE` folded away; no fixtures, ids or emails |
| Secrets | none found in a pattern scan of JS and HTML; no source maps |
| `index.html` | every reference exists; `noindex` kept |


---

## 7. Deployment runbook

This needs no backend, database or nginx change, and no restart. It replaces static files only.

### Step 0: discover the target, read-only (closes B-2)

```bash
sudo nginx -T 2>/dev/null | grep -nE "server_name|root |try_files|location /"
```

Record `WEB_ROOT` for `solu1ions.tech`. Confirm how the current files got there (`ls -la $WEB_ROOT`, and ask whoever deployed on 25 October, 11:41). If it is a symlink to a release folder, use that mechanism in place of steps 3 and 4.

### Step 1: build, on a clean checkout

```bash
git clone <repository> release-build
cd release-build
git checkout release/frontend-production-v1
npm ci
VITE_API_BASE_URL=https://api.solu1ions.tech/api VITE_DEMO_MODE=false VITE_APP_NAME="Solu1ions — Business Development" npm run build
tar -czf frontend-v1.tgz -C dist .
sha256sum frontend-v1.tgz
```

`npm run build` fails if demo content is present. If commits have not been pushed, build from this machine's `release/frontend-production-v1` instead.

### Step 2: back up (on the server)

```bash
STAMP=$(date +%Y%m%d-%H%M)
sudo tar -czf ~/frontend-backup-$STAMP.tgz -C "$WEB_ROOT" .
sudo cp -p "$WEB_ROOT/index.html" ~/index.html.before-$STAMP
tar -tzf ~/frontend-backup-$STAMP.tgz | wc -l
```

### Step 3: add the new files, deleting nothing

Upload and unpack to a temporary folder, verify the checksum, then copy everything **except** `index.html`. New hashed assets sit beside the old ones, and no user is affected yet:

```bash
mkdir -p ~/frontend-v1 && tar -xzf ~/frontend-v1.tgz -C ~/frontend-v1
sudo rsync -a --exclude index.html ~/frontend-v1/ "$WEB_ROOT/"
```

**Never use `--delete`.** Tabs running the old version still need the old chunks.

### Step 4: switch, atomically

`index.html` is what points at everything else, so replacing it is the release. A rename is atomic:

```bash
sudo cp ~/frontend-v1/index.html "$WEB_ROOT/index.html.new"
sudo chown --reference="$WEB_ROOT/index.html" "$WEB_ROOT/index.html.new"
sudo mv "$WEB_ROOT/index.html.new" "$WEB_ROOT/index.html"
```

### Step 5: verify

```bash
curl -s https://solu1ions.tech/ | grep -o 'assets/index-[^"]*'
curl -sI https://solu1ions.tech/my-work | head -1
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://solu1ions.tech/assets/<new-index>.js
curl -s -o /dev/null -w '%{http_code}\n' https://api.solu1ions.tech/api/auth/me
```

Expect the new `index-*.js` name, 200, `200 text/javascript`-style, and 401 (the API is unaffected).

Then in a browser, with a test account: sign in, reload a deep link, open each main section, sign out. Check Chrome, Safari and Firefox, and a phone. Sign in carefully: the API allows 5 attempts a minute.

### Step 6: monitor, for an hour

```bash
sudo tail -f /var/log/nginx/access.log | grep -E '" (4|5)[0-9]{2} '
sudo tail -f /var/log/nginx/error.log
```

The log paths are the Ubuntu defaults; confirm them from step 0. Watch for 5xx from the API, and repeated 404s on `/assets/`. The backend's own logs are for its owners; nothing here touches them.

### Rollback

**Roll back if any of these happen:**
- sign-in or session restore fails for working accounts;
- a role sees the wrong things, or **any client sees another's data**;
- a main page fails to load;
- a rise in API 4xx or 5xx that follows the release.

**Cross-client exposure means roll back at once, and report it.**

Rollback restores one file. It takes seconds, and needs no restart, because the old assets were never removed:

```bash
sudo cp ~/index.html.before-$STAMP "$WEB_ROOT/index.html.new"
sudo mv "$WEB_ROOT/index.html.new" "$WEB_ROOT/index.html"
curl -s https://solu1ions.tech/ | grep -o 'assets/index-[^"]*'
```

Expect `assets/index-BvTI3Aqb.js`. A full restore, if ever needed, is the Step 2 archive.

**If the backup is lost:** `0fd1a49` built with `VITE_APP_NAME="Solu1ions Growth OS"` reproduces the live main chunk exactly.

### Afterwards

- Keep the old assets for at least 7 days, and the backup until the next release.
- Tag the release commit (with approval).
- Later, with separate approval, because nginx is shared with the API: `Cache-Control: no-cache` for `index.html`, `public, max-age=31536000, immutable` for `/assets/`, a real 404 for missing assets, and security headers with HSTS.

---

## 8. Recommendation

**NO-GO today, on two conditions, neither of them in the code.**

The build is ready: gates pass, the output is inspected, routes and CORS are compatible, and the deployment needs no backend or nginx change, with a seconds-long rollback. But authentication, authorisation and client isolation have not been exercised against the real API (B-1), which the release criteria rule out, and the deployment target is not known (B-2).

**It becomes GO when:**
1. the §5 verification passes with approved test accounts;
2. the server's web root is confirmed and the deployer has access;
3. you approve the deployment.
