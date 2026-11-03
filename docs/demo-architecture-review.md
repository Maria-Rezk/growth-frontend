# Demo mode: architecture review and migration plan (Phase 4B-0)

**Date:** 3 November 2026 · **Branch:** `phase-4b-demo-architecture` (from `ddd59d2`) · **Status:** investigation and plan only; no service changed.

Measurements were taken on Windows with Chrome and Node 24, on a machine shared with other work. Each figure says how it was obtained.

---

## 1. Assessment

Demo mode is in better shape for production users than finding F-06 says, and in worse shape for maintenance and test coverage.

**Production users download almost none of it.** Rollup already folds `env.demoMode` to `false` and removes every demo branch and every piece of demo logic.
- A build with every `env.demoMode` hard-wired to `false` is **byte-identical** to the real build.
- What still ships is about **4.2 KB of fixture data, about 1.7 KB gzip**, in the main chunk. It is kept alive by one module-level `.map()` in `CompanyProvider` and by cross-references inside `demoStore`.
- At load it does 64 date calculations. That is cheap, but it is still waste.

**The real costs are structural:**
1. **Two implementations of everything.** There are 151 `env.demoMode` branches in 24 files. 20 modules import `demoStore`, and `tasks.ts` alone carries eight inline functions that copy server rules. Each service method is written twice, and the two can drift apart.
2. **Demo mode skips the code that matters most.** In demo mode the app starts signed in. It never runs:
   - the refresh-cookie session restore;
   - the 401 and 403 handlers;
   - the cross-tab sign-in signal;
   - `GET /me/memberships`, the only source of roles;
   - persistence of the active client.

   All 258 E2E tests and all 172 accessibility scenes run in demo mode, so **none of them exercises the real authentication, session or role-loading code**. Only unit tests and the three-test live suite touch it, and the live suite has no recorded run.
3. **The unit tests depend on an untracked file.** Vitest loads `.env` in test mode. With `VITE_DEMO_MODE=true` there, the service tests would take the demo branches. The suite passes only because the local `.env` has demo mode off.
4. **A misconfigured production build has no guard.** Building with `VITE_DEMO_MODE=true` ships a fully signed-in demo platform admin to every visitor. The fake token cannot reach real data, but nothing stops or flags that build.

**Recommendation:** a fake backend at the axios transport level. It would be loaded only in demo builds, through a dynamic import, and would cover services incrementally: one service per step, leaf services first. Before that, a short step 0 removes the 4.2 KB, makes the unit tests independent of `.env`, and guards production builds. Details in §5 and §6.

---

## 2. N-16: the unidentified unit-test failure

**Result: not reproduced. N-16 stays open.**

**How it was run.** A runner script ran Vitest with the JSON reporter, recording for each run:
- every failing test's name, file, duration and the first lines of its error;
- the CPU load just before the run;
- the slowest tests.

| Batch | Runs | CPU before the run | Duration | Result |
|---|---|---|---|---|
| Parallel (Vitest's default pool and worker count, 12 logical cores) | 6 | 27%, 77%, 63%, 70%, 93%, 100% | 95 to 109 s | 451/451 every time |
| Serial (`--no-file-parallelism`) | 3 | 48%, 20%, 9% | 92 to 391 s | 451/451 every time |

**Slowest tests:**
- Parallel: 1.4 to 2.4 s, at most 48% of the 5 s timeout.
- Serial: 0.7 to 1.0 s.
- Always the same group: user-event interaction tests (`AcceptInvitationPage` account paths, `ContentCalendar`, `LoginPage`, `NotificationsDropdown`) and `httpHeaders`.

**What was reviewed:**
- **Timeouts.** The default 5 s. The Phase 4A fix moved the one-off module-transform cost of the two reset-and-reimport files into a `beforeAll`. Their slowest test was 0.5 s across these 9 runs.
- **Workers and contention.** Parallel tests run 1.5 to 2.5 times slower than serial ones. Starting load from 27% to 100% made no visible difference here. The Phase 4A failure happened while the end-to-end suite, a build and other projects were running at once (sustained 80% CPU and more).
- **Module isolation.** Only `AuthContext.test` and `httpRefresh.test` use `vi.resetModules`. Both warm their imports, and both replace the adapter on the shared `axios` module. That is safe only while no request from an earlier test is still in flight. A timed-out test would break that, so the leak is a consequence of a timeout, not a separate cause.
- **Cleanup and pending promises.** Component tests call `cleanup` in `afterEach`. No test uses fake timers that could be left installed, and no test leaves an interval running.
- **Mocked network.** The service tests use axios adapters per test. `vi.mock` is used for contexts. No test talks to a real network.
- **Application defect or test infrastructure?** No evidence of an application defect. Every failure seen so far, N-16 and the fixed flake alike, was a timeout under heavy contention, or the consequence of one.

**Most likely mechanism (a hypothesis, unproven):** under sustained heavy contention, one of the slow interaction tests passes 5 s. Their 2.4 s worst case at moderate load leaves about 2× headroom, which an over-committed machine can use up.

**Not done, on purpose:**
- Timeouts were not raised, since that would only hide a recurrence.
- The application was not changed.

**To close N-16:** run the unit suite in CI with a JUnit or JSON reporter, so any failure is recorded by name, and keep it on a runner that is not shared with the end-to-end suite. If it recurs, the name will say whether it is one of the interaction tests above.

---

## 3. Demo inventory

### 3.1 Where demo mode is read

**151 branches in 24 files**, plus the flag's definition in `config/env.ts`.

| File | Branches | demoStore symbols used | Inline demo code | Other services it calls |
|---|---|---|---|---|
| `services/tasks.ts` (511 lines) | 17 | demoDelay, demoMemberUser, demoTaskComments, demoTaskLogs, demoTasks, demoUser, filterList, makeId, moveTaskStatus, pushNotification, demoNotFound | demoCheckSequence, demoOpenEarlierStages, demoAssignees, demoLead, demoDraftError, demoReviewError, demoTask, demoLog: **server rules copied into the client** | attachments |
| `services/content.ts` (376) | 16 | demoContentPlans, demoDelay, demoPostComments, demoPostLogs, demoPosts, demoTasks, demoUser, filterList, makeId, pushNotification, demoNotFound | demoStages | attachments |
| `context/CompanyProvider.tsx` | 12 | demoCompany, demoMemberships | `DEMO_COMPANY_DATA`, `DEMO_MEMBERSHIPS` (module level) | companies, memberships |
| `services/campaigns.ts` (169) | 12 | buildCampaignMetrics, demoCampaigns, demoDelay, demoLeads, demoPosts, demoTasks, makeId, demoNotFound | none | attachments |
| `services/responsibilities.ts` (237) | 11 | none | demoAreas, demoMatrix, its own demoDelay | none |
| `services/leads.ts` (259) | 10 | demoDelay, demoLeadHistory, demoLeadNotes, demoLeads, demoUser, filterList, makeId, moveLeadStatus, pushNotification, demoNotFound | none | attachments |
| `services/reports.ts` (152) | 8 | buildMetrics, demoCompany, demoDelay, demoReportShares, demoReports, makeId, demoNotFound | none | none |
| `services/companies.ts` (184) | 8 | demoCompany, demoDelay, demoEmployees, demoMemberships, makeId | none | none |
| `services/ai.ts` (197) | 8 | demoDelay, demoPosts, makeId | demoGenerations, demoGenerate | none |
| `context/AuthProvider.tsx` | 8 | demoUser | none | auth |
| `services/notifications.ts` (79) | 6 | demoDelay, demoNotificationPreferences, demoNotifications | demoVisible | none |
| `services/auth.ts` (92) | 6 | demoCompany, demoDelay, demoUser, makeId | none | none |
| `services/users.ts` (92) | 5 | demoDelay, demoEmployees, makeId | none | none |
| `services/brandProfiles.ts` (42) | 4 | demoBrandProfile, demoDelay | none | none |
| `services/automations.ts` (177) | 4 | demoDelay, makeId | demoRules, demoRuns | none |
| `services/postAssets.ts` (87) | 3 | demoDelay, demoFiles, demoUser, makeId | demoAssets | files |
| `services/files.ts` (70) | 3 | demoDelay, demoFiles, makeId | none | none |
| `services/attachments.ts` (134) | 3 | demoAttachments, demoDelay, demoFiles, demoUser, makeId | none | files |
| `services/invitations.ts` (55) | 2 | demoDelay, demoInvitations, makeId, pushNotification | none | none |
| `services/myWork.ts` (129) | 1 | demoCompany, demoDelay, demoTasks, demoUser | none | tasks |
| `services/memberships.ts` (59) | 1 | demoDelay, demoMemberships | none | none |
| `services/adminDashboard.ts` (115) | 1 | none | returns `null` (no data) | none |
| `pages/admin/AdminDashboardPage.tsx` | 1 | none | an honest "live data only" empty state | none |
| `components/layout/ProtectedRoute.tsx` | 1 | none | skips the "Restoring session…" state | none |

**`services/demoStore.ts`** (445 lines, 20.8 KB of source) holds:
- **Fixtures:** user, company, memberships, brand profile, plans, posts, comments, logs, files, attachments, leads, notes, history, tasks, task comments and logs, reports, campaigns, employees, invitations, notifications, preferences and report shares.
- **Server-like logic:** `buildOverview`, `buildMetrics`, `buildCampaignMetrics`, `filterList`, `moveLeadStatus`, `moveTaskStatus` and `pushNotification`.
- **Helpers:** `makeId`, `demoDelay` (250 ms) and `demoNotFound`.

### 3.2 Behaviour that only demo mode has

**Authentication:**
- The app starts signed in as a `SUPER_ADMIN` demo user holding the token `demo-token`.
- `login` accepts any credentials, and `logout` is local only.
- A full reload signs the user back in, because the state is initialised in memory.
- The 401, 403 and session-refreshed handlers are switched off, and so are the cross-tab sign-in signal and the session restore.
- `acceptInvitation` builds a membership locally.

**Authorisation:**
- Roles come from `DEMO_MEMBERSHIPS`, never from `GET /me/memberships`, so the "roles unavailable" and "roles loading" states never occur.
- The user is a platform admin, so every permission gate passes. A client persona is impossible, which is why V-2 is still open.

**Clients:**
- Always the one demo client.
- The active client is never written to storage.

**Data:**
- **Persistence and reset:** every record lives in module-level arrays that services mutate in place (`Object.assign`, `push`, and `let` reassignment), so a full reload resets everything.
- **Shared store:** content reads tasks; campaigns read leads, posts and tasks for their metrics; My Work reads tasks.
- **Notifications:** leads, tasks, content and invitations all write notifications through `pushNotification`.
- **Server rules copied into the client:** list filtering (`filterList`); lead and task status moves; task stage sequencing; draft and review errors; report and campaign metrics.

**Not in demo mode:**
- **Operations dashboard:** returns nothing, and the page says so instead of inventing figures.
- **Automations:** has demo rules and runs, but they are inline in the service.

### 3.3 Dependencies between the demo pieces

```txt
demoStore ── fixtures ─┬─> auth, AuthProvider ........ user
                       ├─> companies, memberships, CompanyProvider ... company, memberships
                       ├─> files <── attachments, postAssets
                       ├─> content ──> (tasks fixtures)       ─┐
                       ├─> campaigns ──> (leads, posts, tasks) │ shared mutable records
                       ├─> leads, tasks, myWork ──> (tasks)    │
                       └─> pushNotification ──> notifications <┘  (written by leads, tasks, content, invitations)
inline only: responsibilities, automations, ai (posts fixtures + own generations), adminDashboard (null)
```

### 3.4 Tests that depend on demo infrastructure

- **Playwright `demo` project:** every E2E spec (258 tests), the accessibility gate (172 scenes) and the evidence run. It starts `vite` with `VITE_DEMO_MODE=true` on port 5175. Several specs rely on demo-only behaviour:
  - a full reload signs the user back in, so specs use in-app `pushState` after logout;
  - specific fixture names and ids, such as "Nour Clinic", `task-1` and `demo-user`;
  - snooze keys like `growth.waiting-banner.snooze.demo-user`.
- **Unit tests:** none reference demo mode or `demoStore`. They mock contexts, or use a fake axios adapter on the real code paths. They do, however, depend on the untracked `.env` keeping demo mode off (§1, point 3).

### 3.5 What can be isolated, and what needs care

| Can move with low risk | Needs care |
|---|---|
| Leaf services with no cross-entity demo logic: `brandProfiles`, `invitations` (except `pushNotification`), `users`, `memberships`, `files`, `notifications`, `automations`, `responsibilities` | `tasks`, `content`, `leads` and `campaigns` share mutable records and copy server rules. Their fakes have to move together with the shared store, and keep emitting notifications. |
| The residual production data (§4) | `AuthProvider`, `CompanyProvider` and `ProtectedRoute`. Demo mode is a context-level bypass there, not a per-call substitute. Moving it to the transport changes which code runs in demo mode, which is the point, but it needs its own step and its own tests. |
| `adminDashboard`, which returns `null` in demo | Uploads: the fake must emit `onUploadProgress` events the way the files service uses them. |

Moving all demo code into one shared module would just relocate the problem. The duplication is at the service-method level, and that is what must go.

---

## 4. Production bundle baseline

Built with the intended configuration: `npm run build`, with `.env` setting `VITE_DEMO_MODE=false` and no `.env.production`. Vite 5.4.21 and Rollup. Sizes are of the actual files; gzip is level 9, measured file by file with Node's zlib.

| Measure | Value |
|---|---|
| JS files | 64 |
| All JS, raw / gzip / brotli | **855,911 / 291,706 / 255,197 bytes** |
| Main entry chunk `index-*.js` | **142,979 raw / 46,994 gzip** |
| Vendor chunks | `react` 164,459, `data` 93,932, `forms` 86,888 (raw) |
| Largest route chunks | AdminDashboardPage 26,884; PostDetailPage 21,567; TaskFormModal 19,093 |
| Source maps in production | **none**: `build.sourcemap` is unset, so no production map can expose demo code |

**Demo content in production:**
- **What ships:** 4,214 raw bytes, about 1.7 KB gzip measured on its own, all in the eagerly loaded `index` chunk. That is 2.9% of that chunk and 0.5% of all JS.
- **How it was measured:** a second build with `--sourcemap` to a separate folder, with the bytes of each mapped segment attributed to its source line.
- **Records:** 13 demo records with ids ship: the demo user, the company, three memberships (with two nested users, the designer and the client), three posts and three leads. "Nour Clinic", the launch-teaser post and `designer@solu1ions.com` appear in `index-*.js`.
- **Work at load:** 64 calls to `demoStore`'s date helper, and one `demoMemberships.map(...)` in `CompanyProvider`. That is negligible work, but it is pointless in production.
- **Executable demo logic:** **none**. No function from `demoStore` survives (`demoDelay`, `filterList`, `pushNotification`, `moveLeadStatus`, `moveTaskStatus`, the metric builders, `makeId`, `demoNotFound`). Strings from the demo branches, such as `demo-token` and `demo-invite-token`, are absent.
- **Modules shipping demo content:** **2**, `demoStore.ts` (data) and `CompanyProvider.tsx` (the `DEMO_MEMBERSHIPS` constant).
  - A first, mapping-based count said 24. That counted folded expressions such as `env.demoMode ? A : B`, whose demo side is already gone.
- **Strings that are not payload:** `VITE_DEMO_MODE` does not appear; the flag is folded. Twelve `demo` substrings remain in `index`, and all of them belong to the shipped records above.

**Why the data survives:**
- **One module-level call.** `const DEMO_MEMBERSHIPS = demoMemberships.map(...)` in `CompanyProvider` runs at import. Rollup cannot drop a call it cannot prove pure, so it keeps the memberships, and through them the user and the company.
- **Cross-references inside `demoStore`.** Some records read another record's property while being built, for example `demoMemberships[2].user`. With Rollup's default `propertyReadSideEffects`, a property read counts as a possible side effect, so those arrays are kept, or reduced to the bare `iso()` calls inside them.

**Experiment: approach A in its pure form.**
- **What was done:** in a throwaway worktree, every `env.demoMode` was replaced with the literal `false` and the app was built the same way.
- **Result:** 855,911 bytes, identical file names and hashes, and the same three fixture strings present.
- **What it shows:** flag folding is already complete. A build-time flag alone cannot remove the remaining data; the two retention causes above have to be fixed.

**Not measured:** runtime start-up time. At 64 date calls plus one `.map` it is far below what can be measured reliably on this shared machine.

---

## 5. Architecture options

| | A. Build-time flag and tree shaking | B. Demo service implementations, loaded dynamically | C1. Fake backend as an axios adapter (recommended) | C2. Mock Service Worker |
|---|---|---|---|---|
| What it is | Keep the per-method `if (env.demoMode)` branches. Fix the two retention causes so demo data drops out. | Each service gets a typed `demo` twin in `src/demo/services`, chosen at start-up by `import()`. Production imports only the HTTP one. | One adapter answers `apiRoutes` requests from the demo store. `main.tsx` installs it with `import()` only when demo mode is on. Services keep one HTTP implementation. | The same fake backend, served by a service worker through the `msw` library. |
| Production isolation | Data gone after step 0; branches already gone | Complete: the demo code sits in a chunk production never loads | Complete: the adapter and store sit in a dynamically imported chunk | Complete, plus a worker file that must stay out of production `public/` |
| Two implementations? | Yes, per method (151 branches) | Yes, per service, now typed against one interface | **No.** One client implementation; the fake answers at the HTTP level | No |
| Demo exercises the real auth, refresh, 401/403, roles, `unwrap` and error normalisation | No | No | **Yes**: AuthProvider, CompanyProvider, `http.ts` and every service run as in production | Yes |
| E2E fidelity | Unchanged (tests the demo branches) | Unchanged (tests the demo twins) | **Much higher**: only the server is fake | Higher, but a service worker adds timing and registration concerns to every test |
| Type safety | As now | Good, if each twin implements the HTTP service's type | Handlers are typed with the API types the services already use (`types/domain.ts`). Routes come from `apiRoutes`. | Same as C1 |
| Migration effort | Very small | Medium: every service is written again as a twin | Medium to large: the demo logic is rewritten as route handlers. Server-like rules (status moves, sequencing, metrics) move almost unchanged. | Same as C1, plus the new dependency |
| Fits this codebase | Yes, but leaves the real problems | Partly: the duplication stays | **Very well**: every request already goes through the two axios instances in `lib/http.ts`, and the unit tests already fake the network with axios adapters (`httpRefresh.test`, `AuthContext.test`, service tests) | Adds a library and a worker for what one adapter already does in this app |
| Runtime cost in production | None after step 0 | One adapter switch at start-up | **None**: no import, nothing installed | None |
| Developer experience | Two places to change per feature | Two places, kept in step by the compiler | One place for client behaviour. The fake backend lives in `src/demo`, and the Network tab shows nothing (an in-process adapter) | Requests appear in the Network tab |
| Regression risk | Very low | Medium | Medium, contained by going one service at a time with the full E2E suite as the guard | Medium, plus worker lifecycle |
| New dependency | No | No | **No** | Yes (`msw`) |

### Recommendation

**Step 0 from A, then C1, incrementally.**
- **Step 0** is cheap and independent:
  - remove the 4.2 KB and the start-up work;
  - make the unit tests independent of `.env`;
  - make a production build refuse demo mode unless explicitly allowed.
- **C1** is the only option that removes the duplicate implementations without a new dependency, and it is what this code already does in its tests.
  - It also gives the strongest side effect: with C1, the E2E and accessibility suites start to cover the real authentication, refresh, 403 and role-loading code. Today none of that runs in any browser test.
- **B is rejected:** it keeps the duplication, only with types around it.
- **C2 is rejected for now:** a service worker brings registration, scope and a public file to manage, for nothing the in-process adapter cannot do here, given that no request bypasses axios. It stays an option for a later demo deployment where seeing requests in the Network tab matters.

### How C1 would fit

- **Installing the adapter:** `lib/http.ts` gets one function that installs an adapter on both instances (`http`, `refreshClient`). Production never calls it.
- **Choosing at start-up:** `main.tsx` becomes, in effect, `if (env.demoMode) { const { installDemoBackend } = await import('./demo/backend'); installDemoBackend(); }`, run before the first render.
- **Coexistence during migration:** the adapter answers only the routes it knows. Any other request gets an error.
  - A service that has not been migrated still returns from its own branch before reaching the network, so both mechanisms work side by side.
  - Each step moves one service's routes into the adapter and deletes that service's branches.
- **Demo behaviour to keep:**

  | Behaviour today | How the fake keeps it |
  |---|---|
  | Starts signed in | `POST /auth/refresh` succeeds on a fresh page load |
  | Reload signs back in | The store is in memory and resets on reload |
  | Any login works | `POST /auth/login` accepts anything |
  | A visible delay | The adapter delays each response by about 250 ms |
  | Upload progress | The adapter calls `config.onUploadProgress` |

---

## 6. Migration roadmap

Each step:
- is one commit, or a few;
- touches one area;
- leaves both demo and production working;
- is reverted by reverting its commits;
- keeps the API contract (paths, methods, payloads, response handling) unchanged.

**Gate for every step:**
- `npm run lint`, `typecheck`, `test:run` and `build`;
- the full `npm run e2e` suite, plus `npm run e2e:a11y` where screens are involved;
- the bundle measurement script, to confirm no demo bytes were added to production;
- a request-level test (an axios adapter on the real `http`) for every production method the step touches, so payloads and paths are pinned before the demo branch goes.

### Step 0 — production hygiene (no architecture change)

| | |
|---|---|
| Files | `context/CompanyProvider.tsx`; `services/demoStore.ts`; `vitest.config.ts`; `vite.config.ts` (or a small build check) |
| Now | `DEMO_MEMBERSHIPS` is built at module load, and `demoStore` cross-references records while building them. Unit tests read `.env`. Nothing stops `VITE_DEMO_MODE=true` in a production build. |
| Proposed | Compute `DEMO_MEMBERSHIPS` inside the demo branch (lazily). Build cross-referenced records without property reads at module level, or mark them `/*#__PURE__*/`. Pin `VITE_DEMO_MODE=false` for Vitest (`test.env`). Fail `vite build` when `VITE_DEMO_MODE=true`, unless an explicit `VITE_ALLOW_DEMO_BUILD=true` says a demo deployment is intended. |
| Production impact | About −4.2 KB raw in `index`. No demo records and no demo start-up work. No behaviour change. |
| Demo impact | None. The values are the same, only built later. |
| Tests | Bundle script: no fixture strings and 0 demo bytes. A unit test that the tests run with demo mode off. A build-script test that `VITE_DEMO_MODE=true` without the allow flag fails. Full E2E. |
| Risks | The `/*#__PURE__*/` annotation is wrong if construction really had side effects; it does not, since it is plain object literals. A demo deployment needs the allow flag documented. |
| Rollback | Revert the commit. |
| Accepted when | The production `index` has no demo strings. E2E is 258/258. The unit tests pass with `.env` set to `VITE_DEMO_MODE=true`. |

### Step 1 — the fake backend skeleton

| | |
|---|---|
| Files | `lib/http.ts` (one adapter-install function); new `src/demo/backend.ts` (router, delay, error envelope, progress); `main.tsx` (dynamic import when demo mode is on) |
| Now | No transport-level demo |
| Proposed | An adapter that matches `apiRoutes` paths and methods, returns the API's own envelope and error shapes, and sends unknown routes to a clear "not served by the demo" error. It serves no route yet, so every service still answers from its own branch. |
| Production impact | One new exported function, never called. The bundle script must show 0 bytes from `src/demo` in production. |
| Demo impact | None yet. |
| Tests | Unit tests for the router (match, 404, error envelope, delay, progress). Bundle check. Full E2E. |
| Risks | A wrong install order would let a request reach the network before the adapter is installed. Install before `createRoot` and test that. |
| Rollback | Revert. |
| Accepted when | Production output is unchanged. Demo builds load the chunk. Router tests pass. |

### Steps 2 to 4 — leaf services, one per step

**Order:**
1. `brandProfiles` (4 branches, one record, no links to other data)
2. `responsibilities` (inline data)
3. `automations` (inline data)
4. `users`
5. `invitations`
6. `notifications`
7. `files`, then `attachments` and `postAssets` (upload progress)
8. `memberships`
9. `ai`
10. `reports` (metrics)

| | |
|---|---|
| Files per step | `services/<name>.ts`, `src/demo/routes/<name>.ts`, a new request-level test for the service, and E2E specs only if a fixture moves |
| Now | `if (env.demoMode) return demo...` in each method |
| Proposed | Handlers for that service's routes in the fake backend, using the same store; the service's demo branches deleted. |
| Production impact | None. The HTTP branch is the one that already ran; the request-level test proves it is unchanged. |
| Demo impact | The same data and behaviour, now through `http.ts`: real `unwrap`, error normalisation and query keys. |
| Tests | A request-level unit test per method (path, method, payload, response). The E2E specs that touch the screen. The full E2E suite. |
| Risks | A handler returning a different shape from the old branch; the E2E suite and the request-level test catch it. For notifications: the tasks, leads and content branches still call `pushNotification` directly, so the store stays shared until step 5. |
| Rollback | Revert that step's commit; the other services are untouched. |
| Accepted when | `grep env.demoMode services/<name>.ts` returns nothing. All gates pass. |

### Step 5 — the shared, rule-bearing services, together

| | |
|---|---|
| Files | `tasks`, `content`, `leads`, `campaigns` and `myWork`; the store and its rules (`filterList`, `moveLeadStatus`, `moveTaskStatus`, sequencing, metrics) move under `src/demo` |
| Why together | They read and write the same records and emit notifications. Splitting them means two copies of the store. |
| Proposed | Possibly one service per commit, in the order `campaigns` (mostly reads), `leads`, `content`, `tasks`, `myWork`, but on one branch, with the full gate after each commit. |
| Risks | The largest step. The server-rule copies (task sequencing, draft and review errors) move rather than get rewritten, to avoid changing demo behaviour. |
| Rollback | Revert per commit. |
| Accepted when | No `env.demoMode` in `services/`. `demoStore` is imported only from `src/demo`. |

### Step 6 — authentication and clients through the real code

| | |
|---|---|
| Files | `services/auth.ts`, `services/companies.ts`, `context/AuthProvider.tsx`, `context/CompanyProvider.tsx`, `components/layout/ProtectedRoute.tsx`, and the fake auth routes (`/auth/refresh`, `/auth/login`, `/auth/me`, `/auth/logout`, `/me/memberships`, `/companies`) |
| Now | A context-level bypass: the app starts signed in, and the refresh, handlers, memberships and storage are all skipped |
| Proposed | Delete every demo branch in these files. The fake backend serves the session: refresh succeeds on a fresh load, and signing out clears it until the next reload. |
| Production impact | None in code paths; production already runs these. Pinned by `AuthContext.test`, `CompanyContext.test` and `httpRefresh.test`, which stay unchanged. |
| Demo impact | The real session restore, 401/403 handling, role loading and active-client persistence now run in demo mode, so **every E2E test starts covering them**. A brief "Restoring session…" state appears on load. |
| Tests | Full E2E, and a11y. New E2E for the 403 path and the "roles unavailable" path, through fake routes that return those errors. |
| Risks | Specs that relied on the bypass, such as the `pushState`-after-logout pattern. Each adjustment is recorded in its commit. |
| Rollback | Revert the step; services stay migrated. |
| Accepted when | `env.demoMode` is read only in `main.tsx` (the dynamic import) and in the admin dashboard's honest empty state. |

### Step 7 (optional) — client persona

Once roles come from the fake `/me/memberships`, a second demo identity with only client roles costs one fixture and a sign-in choice. That closes the gap behind V-2 for demo testing; the real client check against staging still stands.

**Not in this roadmap:** any change to request payloads, endpoints or authentication rules, and no new dependency.

---

## 7. Production behaviour that must not change, and what covers it

**Key:**
- **Unit** means a Vitest test on the real code path, with a fake adapter or mocks.
- **Demo E2E** means Playwright against demo mode, which today means the demo branch, not the HTTP call.
- **Live** means the read-only suite against a real deployment.

| Behaviour | Unit (real path) | Demo E2E | Live | Gap |
|---|---|---|---|---|
| Sign-in, the refresh-cookie session restore, sign-out | `AuthContext.test` (16), `httpRefresh.test` (8) | Login page UI only; the session is bypassed | sign in, reload, sign out | Real flow in a browser: only the live suite. Step 6 adds demo E2E. |
| Authorization header, credentials, ngrok header | `httpHeaders.test` (5) | not exercised | indirectly | none at unit level |
| 401 → one refresh → retry, or sign-out | `httpRefresh.test` | not exercised | not specifically | **no browser test** |
| 403 → re-read the user, mark roles stale | `AuthContext.test`, `httpRefresh.test` | not exercised | not specifically | **no browser test** |
| Error normalisation (`normalizeApiError`, `isRouteMissing`) | `http.test` (8) | demo branches throw their own shape | no | the demo errors do not use the real normaliser |
| Endpoints and request payloads | `backendContract.test` (posts query, automation runs, post assets, task types), `memberPayloads.test`, `memberships.test`, `attachments.test` | not exercised | page loads only | **Most service methods have no request-level test.** Step 2 onward adds one per method before its demo branch goes. |
| Query keys and invalidation | `useAsync.test`, `queryClient.test`, `useMutation.test` | yes: the same hooks run in demo | n/a | none |
| Pagination and filters | `paging.test`, `useUrlFilters.test` | `filter-matrix`, `workflows` (demo `filterList`, not the server's) | no | the server's own filtering and paging: staging only |
| Uploads and attachments | `attachments.test` (normalising) | yes, against fake uploads | no | **upload request and progress: no test** |
| Notifications | `NotificationsDropdown.test`, `NotificationItem.test` | yes (demo store) | no | the notifications API calls: no request-level test |
| Role-based access | `roleMatrix.test` (13), `permissions.test`, `usePermission.test`, `AgencyRoute.test` | as platform admin only | the pages the account can open | non-admin roles in a browser |
| Client data isolation | `AuthContext.test` "cached server data belongs to one person", `CompanyContext.test` "one person", `useFormDraft.test` "per-user isolation" | one client only | no | switching clients against a real API |

**Staging is required before real-API compatibility can be claimed**, for:
- the live suite (V-1);
- a client-role account (V-2);
- uploads;
- the server's filtering and paging;
- the server's error envelopes on 400, 403, 404 and 409.

None of this is verified by any demo test, and this plan does not claim it.

---

## 8. Risks and rollback

| Risk | Where | Mitigation | Rollback |
|---|---|---|---|
| A demo handler's response shape differs from the old branch | Steps 2 to 5 | Port the old branch's return value as the handler's body. The E2E suite exercises every screen. | Revert the step |
| A production request changes by accident while its branch is removed | Steps 2 to 6 | Write a request-level unit test before deleting the branch, and run it before and after | Revert |
| The fake backend's code reaches the production bundle | Steps 1 to 6 | Dynamic import only. The bundle script runs in every step and must report 0 bytes from `src/demo`. | Revert |
| E2E specs relied on demo-only shortcuts | Step 6 | Change specs only in that step, each change explained | Revert the step |
| Demo deployments break | Step 0 build guard | `VITE_ALLOW_DEMO_BUILD` documented in the README and used by the demo deployment | Revert the guard |
| Machine contention hides or causes flakes | All | Run gates on a quiet machine or in CI; record failing test names (N-16) | n/a |
