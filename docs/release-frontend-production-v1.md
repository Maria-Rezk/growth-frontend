# Frontend production release v1: readiness report and runbook

**Prepared:** 4 November 2026 · **Branch:** `release/frontend-production-v1` · **Status:** not deployed.

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

**B-2. The deployment target is unknown.** The web root, method and access are not in the repository, and server access has not been authorised for this work. The runbook cannot be executed without them. Close it by running §7, step 0.

### HIGH

**F-1. The release commits must be on GitHub before building elsewhere.** `origin/develop` stops at `0fd1a49`; the release branch is 79 commits ahead of it. Until it is pushed, losing this machine loses the release.

**F-2. No cache headers.** With `Last-Modified` and no `Cache-Control`, browsers may reuse `index.html` for a while by their own heuristics. Some users may keep the old app after the release until it revalidates. Old assets must therefore stay on the server (§7). No nginx change is needed to release safely.

### MEDIUM

**F-3. A missing asset returns `200 text/html`.** The SPA fallback also catches `/assets/*`. A deleted chunk reaches an old tab as HTML. The app's `chunkReload` recovers by reloading once, in both the old and new builds, but only if old assets are kept does this stay rare.

**F-4. Firefox and WebKit were not tested.** Only Chrome and Edge are installed here. Check Safari and Firefox by hand after release, or install Playwright's browsers.

**F-5. No security headers or HSTS on the frontend.** This is the same as today, so the release does not worsen it. A later nginx change needs approval, since nginx is shared with the API.

**F-6. N-22: clearing Brand notes does nothing on the real API.** The form omits the field, and the backend's update ignores an absent field (`brand-profiles.service.ts`: `if (dto.brandNotes !== undefined)`). This is today's behaviour too; the release does not change it.

**F-7. The browser-tab name changes** from "Solu1ions Growth OS" to "Solu1ions — Business Development". Confirm this is wanted.

**F-8. One refresh token per user (backend source, not tested live).** `auth.service.ts` stores a single `refreshTokenHash` per user, and a refresh with any other token clears it. Two consequences to confirm in §5:
- signing in on a second browser or device ends the first session at its next refresh;
- two open tabs share no refresh lock (`refreshInFlight` is per tab), so if both refresh at once, the loser clears the hash and the user is signed out everywhere.

This is the same on the live build, so the release does not cause it. A fix would be a backend or app change, outside this release.

**F-9. Rate limits may be shared by all users (backend source, not tested live).** The backend does not set `trust proxy`, so behind nginx `req.ip` is likely to be the proxy's address. If the deployed backend matches, the limits of 5 sign-ins and 20 refreshes a minute apply to everyone together. Each page load makes a refresh, so normal use could hit it, and verification traffic could lock out real users. Run §5 at a quiet time. The backend's owners should check this; nothing here changes it.

### LOW

- **N-15:** a private copy of `monthName`.
- **N-16:** one unidentified unit-test failure in 28 runs.
- **Login throttling:** the API allows 5 sign-in attempts a minute, so smoke testers should sign in carefully.
- **`dist` caveat:** build from a clean checkout, so no local `.env.production` changes the result.
- **Certificate:** Let's Encrypt, expires 24 December 2026; renewal is presumably automatic but was not verified.

---

## 5. Closing B-1: authenticated verification

**Status: not run.** No test account exists in this environment. Nothing in the table below has passed.

### Accounts needed

Created by an administrator, on test clients only, with no real customer records:

| # | Account | `platformRole` | Membership | Needed for |
|---|---|---|---|---|
| 1 | Platform Admin | `AGENCY_ADMIN` or `SUPER_ADMIN`, as real admins have | none | Admin pages, all-client view |
| 2 | Agency staff | `USER` | `ACCOUNT_MANAGER` on Test Client A only | Agency navigation, staff permissions |
| 3 | Client Owner | `USER` | `CLIENT_OWNER` on Test Client A only | Client portal |
| 4 | Client Reviewer | `USER` | `CLIENT_REVIEWER` on Test Client A only | Reduced client portal |
| 5 | Isolation control | `USER` | `CLIENT_OWNER` on Test Client B only | Proves isolation from the other side |

**Test data needed:** Test Client A and Test Client B, each with at least one post, task, lead and report, and more than one page of one list if possible. Give the record addresses for Test Client B. Isolation cannot be proved without a known record to try.

**Rules for the accounts:**
- All must be active, with invitations accepted and passwords set. Each is used in one browser at a time (F-8).
- **Passwords stay out of this chat.** They go in your own terminal as environment variables, or you type them at sign-in. I will not enter them: the local page relays them to production.

### How it runs

The new frontend runs on the tester's machine through the dev proxy, so the backend's CORS list needs no change. The proxy path was checked on 4 November with credential-free GETs: `/api/auth/me` and `/api/me/memberships` both returned 401 from production through it.

```env
# .env.development.local: NOT git-ignored, so never commit it; delete it afterwards
VITE_API_BASE_URL=/api
VITE_DEV_PROXY_TARGET=https://api.solu1ions.tech
```

The red "PRODUCTION API" ribbon will show; that is expected.

**Do not run `npm run e2e:live` against production as it stands.** It reloads 17 pages back to back, and each reload is a refresh, against a limit of 20 a minute that real users may share (F-9). Its own header also says "never production".

Instead, a small paced runner is written once the accounts exist, outside the release code. It has not been written yet. It must:
- abort every request except GETs and `POST /auth/login`, `/auth/refresh` and `/auth/logout`, and report any it aborted;
- leave at least 5 seconds between full page loads, and 15 seconds between sign-ins;
- use one account at a time, at a quiet time.

Signing in, refreshing and signing out write the account's own session row. Nothing else in this procedure writes.

### Verification matrix

| # | Check | Accounts | Method | Pass when | Result |
|---|---|---|---|---|---|
| 1 | Login and logout | 1 to 5 | Sign in, sign out, open a private address | Lands in the app; afterwards redirected to sign-in | NOT RUN |
| 2 | Session restore | 1 to 5 | Reload a deep link | Same page, still signed in, no sign-in flash | NOT RUN |
| 3 | Token refresh | 2 | Idle past the access-token lifetime (15 minutes by default; deployed value unknown), then navigate | One `POST /auth/refresh`, the request is retried, no sign-out | NOT RUN |
| 3a | Two tabs (F-8) | 2 | Two tabs, idle past expiry, act in both at once | Record what happens | NOT RUN |
| 4 | Expired session | 2 | Delete the refresh cookie in the browser, reload | Sign-in page, return address kept, no error loop | NOT RUN |
| 5 | 401 and 403 | 3, 4 | Open an agency-only address and an admin address directly | Refused or redirected, memberships re-read, no blank page | NOT RUN |
| 6 | Role navigation | 1 to 5 | Compare the menu and visible actions with `utils/permissions.ts` | Nothing beyond the role; no "We could not confirm your role" | NOT RUN |
| 7 | Client portal | 3, 4 | Open each client page | Loads on real data; reviewer sees less than owner; no agency pages | NOT RUN |
| 8 | **Cross-client isolation** | 2, 3, 4 and 5 | Open Client B's record addresses as a Client A user, and the reverse; check the client switcher and raw API status | "Not found" or "no access", no Client B data in any response | NOT RUN |
| 9 | Real API responses | 1 to 5 | Visit each list and detail page, watch console and network | No parse failures, console errors, or unexpected 4xx or 5xx | NOT RUN |
| 10 | Filtering and pagination | 1, 2 | Each list's filters and next page | Results match, counts agree, no duplicate rows across pages | NOT RUN |

Any failure in row 8 stops the release.

**Not in this run:** uploads, approvals and task changes are writes, so they need a test client and separate approval. Because the proxy drops `Origin`, real cross-origin cookies and CORS are only proved by the post-deploy check in §7, step 5.

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
| Live suite (`npm run e2e:live`) | **Not run**: no test account (B-1), and not safe unpaced on production (§5) |

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

**Re-verified 4 November on `e1e613e`.** There is no code difference from `2e8486c`, so the gates above still stand and were not rerun. The build was rerun, with `dist` removed first:

| Check | Result |
|---|---|
| Branch and commit | `release/frontend-production-v1`, `e1e613e`; `2e8486c` is an ancestor; working tree clean |
| Build and `check:demo-free` | pass, 54 markers, 64 JS files |
| Expected file names | `assets/index-Bw0o3365.js`, `assets/index-C_qgoLUK.css` |
| Runbook build environment | output identical to `dist`, file for file |
| Production API | `https://api.solu1ions.tech/api` in the main chunk |
| Build guard | `VITE_DEMO_MODE=true` refused |
| Unfinished adapter work | `src/demo` absent; no `installAdapter` in `lib/http.ts` |
| API contract | `apiRoutes.ts` unchanged since the live `0fd1a49` |
| UX and accessibility work | sampled merge points are ancestors of `HEAD` |
| Still live at solu1ions.tech | `index-BvTI3Aqb.js`, `index-Cuw6KMEG.css`: nothing has been deployed |

---

## 7. Deployment runbook

This needs no backend, database or nginx change, and no restart. It replaces static files only.

### Step 0: discover the target, read-only (closes B-2)

An authorised administrator runs [`release-server-discovery.sh`](release-server-discovery.sh) on the server. It changes nothing, prints selected nginx directives rather than whole files, reads no `.env` file or key, and redacts credential-like lines. It was tested only on a simulated server, so read its output before sharing it.

```bash
sh release-server-discovery.sh > discovery.txt 2>&1
```

**Results needed:**

| Result | Why |
|---|---|
| `server_name`, `root` or `alias` for `solu1ions.tech` and `www` | The destination; whether both names share one root |
| `index.html` in that root names `index-BvTI3Aqb.js` | Proves this is the folder being served |
| Owner, group and permissions of the root, `index.html` and `assets` | What the new files must match |
| Symlinks, parent folder, `.git` | Plain folder, release folders, or a checkout |
| Backups, deploy scripts, timers | Existing method to follow; anything that could overwrite the release |
| Containers and mounts | Whether nginx serves from a volume |
| Free space, `rsync`, `tar`, sudo | Whether the steps below can run |
| Log paths | Step 6 |
| Who deployed on 25 October, 11:41, and how | Not visible from the server; ask them |

**Steps 2 to 4 and Rollback below assume a plain folder.** That has not been confirmed, and rollback has not been checked against the real layout. If the root is a symlink to a release folder, the release and rollback become a link switch. If it is a container volume or a git checkout, they need rewriting. This section is finalised from the discovery results before approval.

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
sudo chmod --reference="$WEB_ROOT/index.html" "$WEB_ROOT/index.html.new"
sudo mv "$WEB_ROOT/index.html.new" "$WEB_ROOT/index.html"
```

### Step 5: verify

```bash
curl -s https://solu1ions.tech/ | grep -o 'assets/index-[^"]*'
curl -sI https://solu1ions.tech/my-work | head -1
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://solu1ions.tech/assets/index-Bw0o3365.js
curl -s -o /dev/null -w '%{http_code}\n' https://api.solu1ions.tech/api/auth/me
```

Expect `assets/index-Bw0o3365.js`, 200, `200` with a JavaScript content type, and 401 (the API is unaffected). A `200 text/html` on the asset means the file is not there (F-3).

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
sudo chown --reference="$WEB_ROOT/index.html" "$WEB_ROOT/index.html.new"
sudo chmod --reference="$WEB_ROOT/index.html" "$WEB_ROOT/index.html.new"
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

**NO-GO on 4 November. Both blockers remain open, and neither is in the code.**

| Item | State |
|---|---|
| Release candidate | `2e8486c` code, `e1e613e` docs; re-verified, unchanged |
| Destination | Unknown; not guessed |
| Access method | Not authorised yet |
| Authenticated tests | 0 of 10 run; no accounts |
| Rollback | Written for a plain folder; not verified against the real layout |

**It becomes GO when:**
1. discovery results are in, and §7 and the rollback are finalised against them;
2. the §5 matrix passes with approved test accounts, including row 8;
3. the branch is pushed (F-1), and F-7 is confirmed;
4. you approve the final release plan.
