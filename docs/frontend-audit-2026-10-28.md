# Frontend & UI/UX Audit — Solu1ions Growth Platform

**Date:** 28 October 2026 · **Branch:** `develop` @ `0fd1a49` · **Scope:** the whole `src/` tree (≈37k lines, 34 routes)
**Method:** I read the code, ran every quality gate, and drove the app in a browser (demo mode, local Vite on :5174) at 320, 375, 768, 1024 and 1440 px, in light and dark themes.
**Status:** audit written at `0fd1a49`; resolution status updated after Phase 1 (see §0a). Finding text below describes the state *at audit time*; fixed findings are marked in their headings.

---

## 0a. Resolution status

| Finding | Status | Commit | Tests |
|---|---|---|---|
| F-02 dev env pointed at production | ✅ Resolved | `cf683bc` | `src/config/env.test.ts` |
| F-01 Escape/Enter on nested discard confirm | ✅ Resolved | `fd2a994` | `ConfirmDialog.test.tsx` |
| F-05 `SegmentedControl` selected state | ✅ Resolved | `deec718` | `SegmentedControl.test.tsx` |
| F-03 off-canvas drawer focus | ✅ Resolved | `56eb81c` | `e2e/demo/responsive.spec.ts` |
| F-04 no-client blank landing / guard | ✅ Resolved (code-confirmed; demo cannot produce the state) | `ad543d5` | `AgencyRoute.test.tsx` |
| F-07 missing records dead end | ✅ Resolved | `a33992a` | `e2e/demo/not-found.spec.ts` |
| — stale e2e specs after `0fd1a49`, Vite watcher EBUSY | ✅ Resolved (not an audit finding) | `9acc2db` | task-drafts, workflows specs |
| F-15 invitation token in URL / raw field | ✅ Resolved (Phase 1) | `1c4896c` | `AcceptInvitationPage.test.tsx`, `e2e/demo/auth.spec.ts` |
| F-14 404 outside shell, URL rewritten | ✅ Resolved (Phase 1) | `81ed0be` | `NotFoundPage.test.tsx`, `e2e/demo/navigation.spec.ts` |
| F-09 dialogs open on the Close button | ✅ Resolved (Phase 1) | `04437e9` | `Modal.test.tsx`, `e2e/demo/dialogs.spec.ts` |
| F-08 notifications `role="menu"` | ✅ Resolved (Phase 1) | `972b185` | `NotificationsDropdown.test.tsx`, `e2e/demo/workflows.spec.ts` |

**Still open:**
- **P2:** F-06, F-10, F-11, F-12, F-13, F-16, F-17, F-18, F-19, F-20, F-21, N-3
- **P3:** F-22 – F-33, N-1, N-2

**Verification still outstanding (treat as P1):**
- **V-1:** live suite on staging
- **V-2:** a client-role pass
- **V-3:** axe scan

## 0. How to read this

- **Confirmed** = I reproduced it in the browser or it is plain in the code at the line cited.
- **Code-confirmed, not run** = the code path is clear, but the state could not be produced in demo mode.
- **Risk / Suggestion** = not a defect today, but worth deciding on.
- **No P0 was found.** Nothing blocks core functionality in the flows I could exercise.

### What was NOT verified

| Area | Why |
|---|---|
| Real API: sign-in, refresh-cookie rotation, 401/403 paths, uploads, signed download URLs | No staging URL or test account. `.env.development` points at the **production** API (see F-02), so I deliberately did not run against it. |
| Client-role portal as a real client user | Demo user is staff/admin. `/home` was rendered as staff only. |
| Zero-membership employee experience | Not producible in demo data (see F-04, code-confirmed). |
| 1920 px viewport | Not run. 1440 px showed no layout problems, and nothing in CSS caps width differently above 1440, so the risk is low but it is unverified. |
| Arabic / RTL | Feature-flagged off (`VITE_ENABLE_ARABIC=false`). Only navigation is translated. |
| Screen reader pass (NVDA/VoiceOver), automated contrast scan (axe), Lighthouse/Core Web Vitals | Not run. Findings here come from DOM inspection only. |
| Safari, Firefox, real touch devices | Chrome only, with device emulation. |

---

## 1. Executive summary

**Overall: a strong, deliberate codebase with a polished-looking product. Most of what is left is interaction detail and accessibility, not architecture.**

Engineering is above average for a product at this stage:
- Strict TypeScript with only 3 `any`s and no `@ts-ignore`. ESLint has 0 errors. **306/306 tests pass.** The build is clean.
- Every route is lazy-loaded. Vendor code is in separate chunks; the largest app chunk is 27 kB (admin dashboard). A stale chunk after a deploy triggers one automatic reload.
- The auth design is sound. The access token lives in memory only, the refresh call is single-flight, the cache is cleared when the identity changes, and sign-out is broadcast to other tabs.
- One HTTP client, one error normaliser, and a semantic query-key registry that is used almost everywhere.
- A real token-based design system with full light/dark themes, a skip link, reduced-motion support and focus-visible rings.
- No horizontal page overflow on any of the 25 authenticated routes, even at 320 px.

The gaps, in order of user impact:
1. **Keyboard and focus handling around overlays.** Nested dialogs, the mobile drawer, the notifications "menu" and the default focus inside dialogs all have problems. One of them can silently lose a user's typed work (F-01).
2. **Some "dead ends" and edge states.** Missing records show a generic "Couldn't load / Retry" with no way back. An employee with no client gets a blank screen at `/`.
3. **Configuration hygiene.** `npm run dev` talks to the production API by default. Demo fixtures and about 150 demo branches ship in the production bundle. The README is out of date.
4. **Mobile information density.** Several pages stack 4–11 stat tiles plus a banner before the first actionable item.
5. **Design-system drift.** There are 8 unused legacy UI files, 9 hand-built tables beside `DataTable`, 17 distinct font sizes (some fractional), and 12 different breakpoints in a 5,363-line single stylesheet.

**Maturity scores (my judgement):** Engineering 8/10 · Visual design 7.5/10 · UX flows 7/10 · Accessibility 6/10 · Responsive 7/10.

---

## 2. Page / route inventory

| Route | Page | Guard | Desktop 1440 | Mobile 320/375 | Notes |
|---|---|---|---|---|---|
| `/login` | LoginPage | public | ✔ | ✔ | Clean. |
| `/forgot-password` (+`?token=`) | ForgotPasswordPage | public | code review | code review | Strips token from URL (good). |
| `/accept-invitation` | AcceptInvitationPage | public | code review | – | F-15 |
| `/r/:token` | PublicReportPage | public | ✔ (invalid-token state) | – | Good expired-link copy. |
| `/` | LandingRedirect | auth | ✔ | ✔ | F-04 |
| `/my-work` | MyWorkPage | agency | ✔ | ✔ | F-20 |
| `/dashboard` | DashboardPage | agency | ✔ | ✔ | Nav says "Client overview" but H1 is the client name (F-24). |
| `/brand-profile` | BrandProfilePage | auth | ✔ | ✔ | |
| `/content-plans`, `/:planId` | ContentPlans* | auth | ✔ | ✔ | |
| `/ai-studio` | AiStudioPage | agency + `ai:generate` | ✔ | ✔ | |
| `/posts`, `/:postId` | Posts*, PostDetail | auth | ✔ | ✔ | F-07, F-21 |
| `/campaigns`, `/:campaignId` | Campaigns* | agency | ✔ | ✔ | |
| `/leads`, `/:leadId` | Leads*, LeadDetail | agency + `leads:manage` | ✔ | ✔ | F-19 |
| `/tasks`, `/:taskId` | Tasks*, TaskDetail | agency | ✔ | ✔ | F-01, F-07, F-18 |
| `/approvals` | ApprovalQueuePage | agency | ✔ | ✔ | |
| `/responsibilities` | ResponsibilitiesPage | agency | ✔ | ✔ | |
| `/automations` | AutomationsPage | agency + perm | ✔ | ✔ | Toggles 40×22 px (F-22). |
| `/reports`, `/:reportId` | Reports*, ReportDetail | auth + perm | ✔ | ✔ | |
| `/members` | MembersPage | agency + perm | ✔ | ✔ | |
| `/notifications` | NotificationsPage | auth | ✔ | ✔ | 13 px checkboxes (F-22). |
| `/home` | ClientHomePage | auth | ✔ (as staff) | ✔ | Real client role not verified. |
| `/admin/dashboard`, `/activity`, `/employees`, `/clients` | Admin* | platform admin | ✔ | ✔ | Employees table scrolls sideways at 768 px (intended). |
| `/404`, `*` | NotFoundPage | public | ✔ | – | F-14 |

---

## 3. Master issue list (ranked)

### P1 — High

#### F-01 · Discard-changes dialog: Escape doesn't cancel, and Enter discards — ✅ Resolved
- **Page / component:** every form modal that uses `useDiscardGuard`: TaskFormModal, Create/Edit employee, Assign client, PostContentEditor, ReportShareDialog, TaskDrafts. Source: `components/ui/Modal.tsx:34`, `components/ui/ConfirmDialog.tsx:58`, `hooks/useDiscardGuard.ts`.
- **Category:** UX / Accessibility · **Status:** Confirmed in the browser.
- **Problem:**
  1. If you press Escape on the "Discard changes?" confirm, it closes and immediately opens again, so you can't get out with the keyboard.
  2. The dialog opens with focus on **Discard**, the destructive button. A keyboard user who presses Escape and then Enter throws away their work.
- **Evidence:** On `/tasks` → New task, type a title and press Escape. The confirm opens. Press Escape again: both dialogs are still open, and `document.activeElement` is the "Discard" button.
- **Root cause:** Each `Modal` registers its own `document` keydown listener for Escape, with no stacking. Escape reaches the underlying form modal's `onClose`, which is the discard guard, and that calls `confirm()` again. The confirm then settles the new promise. On top of that, `ConfirmProvider` always passes `initialFocusRef={confirmButton}`.
- **Fix:**
  - Make Escape apply only to the top-most dialog.
  - For `tone: 'danger'`, put initial focus on the Cancel button.
- **Implementation:**
  - Keep a module-level modal stack in `Modal.tsx`: push on open, pop on close. In the keydown handler, return early unless this dialog is the top of the stack, and call `event.stopPropagation()`.
  - In `ConfirmProvider`, add a `cancelButton` ref and choose `initialFocusRef = pending?.tone === 'danger' ? cancelButton : confirmButton`.
- **Expected result:** Escape closes only the confirm and the form keeps its data. Enter on a destructive confirm does nothing destructive.
- **Effort:** Small.

#### F-02 · `npm run dev` points at the production API — ✅ Resolved
- **Where:** `.env.development` (committed) sets `VITE_API_BASE_URL=/api` and `VITE_DEV_PROXY_TARGET=https://api.solu1ions.tech`.
- **Category:** Frontend / Security · **Status:** Confirmed.
- **Problem:** Every local dev session reads and writes production data through the Vite proxy: real clients, posts and leads. One mistaken click while testing (delete client, publish, approve) changes production.
- **Root cause:** A workaround for CORS (comment in that file) became the default.
- **Fix:**
  - Default dev to a local or staging API.
  - Make production opt-in via a git-ignored `.env.development.local`.
- **Implementation:** Remove the two lines from `.env.development`, or point them at staging. Document the proxy option in `.env.example` (it is already there). Optionally, show a red "PRODUCTION API" ribbon in the topbar when `import.meta.env.DEV && apiBaseUrl` resolves to the prod host.
- **Expected result:** No developer touches production by accident.
- **Effort:** Small.

#### F-03 · Off-canvas sidebar is still keyboard-focusable, and the open drawer has no focus management — ✅ Resolved
- **Where:** `components/layout/DashboardLayout.tsx:31-32`, `components/layout/Topbar.tsx:18`, `.sidebar` CSS.
- **Category:** Accessibility / Responsive · **Status:** Confirmed at 375 and 768 px.
- **Problem:**
  - **Closed** (≤ ~980 px): the sidebar is moved off-screen with `transform`, but it stays `visibility: visible` and is not `inert`. Keyboard users tab through about 20 invisible links before reaching the page. I verified that `a.focus()` succeeds while the sidebar sits at x = −273.
  - **Open:** focus stays on the hamburger button behind the scrim, the page behind is not inert, the drawer has no Close button, and the hamburger has no `aria-expanded` / `aria-controls`.
- **Fix:** Treat the mobile drawer as a modal dialog.
- **Implementation:**
  - Under the drawer breakpoint, add `visibility: hidden` to `.sidebar:not(.sidebar--open)`. Delay the visibility change with `transition: transform .2s, visibility 0s .2s` so the slide-out animation still plays.
  - When open: add `role="dialog" aria-modal="true" aria-label="Main navigation"`, call `useFocusTrap(sidebarRef, open)`, set `inert` on `.main-shell`, and add an in-drawer Close button.
  - On the hamburger: `aria-expanded={sidebarOpen} aria-controls="app-sidebar"`.
- **Expected result:**
  - Tab order on mobile starts at the topbar.
  - Opening the menu moves focus into it, Tab stays inside, and Escape returns focus to the hamburger.
- **Effort:** Small–Medium.

#### F-04 · Employee with no client: blank screen at `/`, and agency guard never resolves — ✅ Resolved
- **Where:** `components/layout/AgencyRoute.tsx:12,19`, `hooks/useClientView.ts` (`ready = !loading && Boolean(activeCompanyId)`).
- **Category:** UX / Frontend · **Status:** Code-confirmed, not run.
- **Problem:** With zero memberships, `activeCompanyId` stays `null`, so `ready` is never true:
  - `LandingRedirect` returns `null`, which leaves an empty main area under the shell.
  - `AgencyRoute` renders `<Outlet/>` while `!ready`. A client user who deep-links to `/leads` therefore mounts the agency page and starts its requests for a moment before being redirected. The comment in that file says "the page never mounts", which is not accurate.
- **Fix:** Separate "still loading" from "loaded with no client".
- **Implementation:**
  - Return `{ isClient, ready, hasCompany }` from `useClientView`, where `ready = !loading`.
  - In `AgencyRoute`, render `<LoadingState/>` while loading instead of `<Outlet/>`.
  - In `LandingRedirect`, if loaded with no company, render an explicit empty state ("You haven't been added to a client yet — ask an admin") or send platform admins to `/admin/dashboard`.
- **Expected result:** No blank screens, and agency pages never mount for client users.
- **Effort:** Small.

#### F-05 · `SegmentedControl` doesn't expose which option is selected — ✅ Resolved
- **Where:** `components/ui/SegmentedControl.tsx:22-30`. Used by Tasks (scope, board/table), Posts, Leads, Automations, the Admin dashboard, LinkOrNoteForm and LanguageToggle.
- **Category:** Accessibility · **Status:** Confirmed.
- **Problem:** The active state is shown only by the CSS class `segmented__button--active`. A screen reader hears a row of identical buttons and can't tell which filter or view is on.
- **Fix / Implementation:** Add `aria-pressed={option.value === value}` to each button. That is the smallest correct change. The alternative is `role="radiogroup"` with `role="radio"`, `aria-checked` and roving tabindex.
- **Expected result:** "All tasks, toggle button, pressed."
- **Effort:** Small.

### P2 — Medium

#### F-06 · Demo mode ships in the production bundle
- **Where:** `services/demoStore.ts` (436 lines of fixtures), imported by 21 modules. There are 151 `env.demoMode` branches across services.
- **Category:** Frontend / Performance / Maintainability · **Status:** Confirmed: the demo string "Nour Clinic" is in the production `index-*.js`.
- **Problem:**
  - Fixture data and the demo code paths are downloaded by every real user. Because the flag is read at runtime, the code is not tree-shaken.
  - Every service method is two implementations in one, which doubles the surface to keep in sync. (`docs/` already records drift between the two.)
- **Fix:** Move demo mode to the network boundary.
- **Implementation:**
  - Implement demo responses as an axios adapter, or MSW handlers, loaded through `if (import.meta.env.VITE_DEMO_MODE === 'true') await import('./demo/adapter')` in `main.tsx`.
  - Services then contain only the real HTTP call.
  - Do it incrementally, one service per PR, starting with the leaf services.
- **Expected result:** Production `index` chunk gets smaller; services shrink by roughly 30–40 %; demo and real paths can't drift apart.
- **Effort:** Large (incremental).

#### F-07 · Missing records show a generic retryable error with no way back — ✅ Resolved
- **Where:**
  - `pages/TaskDetailPage.tsx:67`
  - `pages/PostDetailPage.tsx:85`
  - `pages/LeadDetailPage.tsx:87`
  - `pages/CampaignDetailPage.tsx:56`
  - `pages/ContentPlanDetailPage.tsx:54`
  - `pages/ReportDetailPage.tsx:52`
- **Category:** UX · **Status:** Confirmed (`/tasks/does-not-exist`).
- **Problem:** A deleted or mistyped record shows "Couldn't load this data · Task not found · **Retry**":
  - Retrying can't help.
  - There is no H1, no link back to the list, and the tab title falls back to the app name.
  - In demo mode the page also spins for about 4 s first, because `shouldRetry` retries errors that have no `statusCode`.
- **Fix:** Add a shared `NotFoundState`.
- **Implementation:**
  - Create `<RecordNotFound kind="task" backTo={appRoutes.tasks} />`, which renders an H1 "Task not found", one line of explanation, and a "Back to tasks" button, and calls `usePageTitle`.
  - In each detail page, branch on `errorStatus === 404` before the generic `ErrorState`.
  - Give demo "not found" errors `statusCode: 404`.
- **Expected result:** Missing records lead somewhere useful, immediately.
- **Effort:** Small.

#### F-08 · Notifications panel is labelled `role="menu"` but isn't a menu — ✅ Resolved
- **Where:** `components/notifications/NotificationsDropdown.tsx:78`.
- **Category:** Accessibility · **Status:** Confirmed.
- **Problem:**
  - `role="menu"` promises `menuitem` children and arrow-key navigation, and neither is present.
  - The panel holds a header, buttons and list items, so screen readers announce it wrongly and may switch modes.
  - Focus is not moved into the panel when it opens.
- **Fix:** Make it a disclosure.
- **Implementation:**
  - Remove `role="menu"` and use `role="region" aria-label="Recent notifications"`, or a non-modal dialog.
  - Change the trigger to `aria-haspopup="dialog"`, or drop the attribute.
  - Move focus to the first item when the panel opens and back to the bell when it closes.
- **Effort:** Small.

#### F-09 · Dialogs put initial focus on the "×" Close button — ✅ Resolved
- **Where:** `hooks/useFocusTrap.ts:29-36` (first focusable wins). The header Close button is first in the DOM.
- **Category:** UX / Accessibility · **Status:** Confirmed (Create task → `activeElement` is "Close dialog").
- **Problem:** Keyboard users must Tab past Close before reaching the first field. One accidental Enter closes the form.
- **Fix:** Default initial focus to the first form control in `.modal__body`, falling back to the dialog itself.
- **Implementation:** In `Modal`, if `initialFocusRef` is not given, pass a ref to the first `input, select, textarea` inside the body.
- **Effort:** Small.

#### F-10 · Mobile filter controls are cut off with no visible way to scroll
- **Where:** `.segmented` (`styles/global.css:1253-1270`, scrollbar hidden), on the Tasks scope control at 320–375 px.
- **Category:** Responsive / UX · **Status:** Confirmed ("Awaiting my app…" is clipped and "My drafts" is not visible).
- **Problem:** The options scroll sideways inside a container that hides its scrollbar and shows no fade or arrow, so users don't know the hidden options exist.
- **Fix:** Below 480 px, either let the control wrap (`flex-wrap: wrap`) or add an edge fade mask. On Tasks, a `<Select>` for scope on phones would be simpler still.
- **Effort:** Small.

#### F-11 · `useAsync` falls back to a cache key built from the function's source text
- **Where:** `hooks/useAsync.ts:44-48` (`['legacy-async', factory.toString(), ...deps]`). Still used by 5 calls: `PostDetailPage.tsx:48-49`, `TaskDetailPage.tsx:44-45`, `ReportDetailPage.tsx:47`.
- **Category:** Frontend · **Status:** Confirmed (latent).
- **Problem:**
  - Two components whose factories have the same source text but capture different variables would share one cache entry.
  - Minification changes the keys.
  - These comment and log queries sit outside the `['companies', id, …]` tree, so prefix invalidation never reaches them.
  - The notifications dropdown already had a bug from exactly this pattern; see the comment in `NotificationsDropdown.tsx:20-25`.
- **Fix:**
  - Add `queryKeys.postComments`, `postLogs`, `taskComments`, `taskLogs` and `reportDetail` under the company prefix.
  - Make `queryKey` required in `useAsync`, and delete the fallback.
- **Effort:** Small.

#### F-12 · `ngrok-skip-browser-warning` header on every production request
- **Where:** `lib/http.ts:86,104,147`.
- **Category:** Frontend / Performance · **Status:** Confirmed.
- **Problem:** A non-safelisted custom header forces a CORS preflight on every GET, which adds a round trip to every request. It also means the production API's CORS config has to allow a header that only ngrok tunnels need.
- **Fix:** Send the header only when `env.apiBaseUrl` contains `ngrok`, or only when `import.meta.env.DEV`.
- **Effort:** Small.

#### F-13 · README and setup docs are stale
- **Where:** `README.md`.
- **Category:** Maintainability · **Status:** Confirmed.
- **Problem:**
  - The README still recommends `VITE_DEMO_MODE=true`.
  - It lists an API contract that `docs/backend-contract-audit.md` has since corrected.
  - It doesn't mention `.env.development`, the proxy, Playwright, `e2e:evidence`, or the role model.
  - It includes destructive Windows commands (`taskkill /F /IM node.exe`, deleting the lockfile).
- **Fix:** Rewrite it around the current scripts (`qa/README.md` is already accurate), link to `docs/`, and remove the lockfile-deletion advice.
- **Effort:** Small.

#### F-14 · 404 page leaves the app shell and rewrites the URL — ✅ Resolved
- **Where:** `App.tsx` (`<Route path="*" element={<Navigate to="/404" replace/>}`), `pages/NotFoundPage.tsx:11,14`.
- **Category:** UX · **Status:** Confirmed.
- **Problem:**
  - A signed-in user who mistypes a URL loses the sidebar, and the address bar changes to `/404`, so they can't see or fix the typo.
  - The copy says "The route you requested…", which is developer language.
  - The button always goes to `/dashboard`, but staff land on `/my-work` and clients on `/home`.
- **Fix:**
  - Render `NotFoundPage` in place, without the redirect.
  - Add a catch-all inside the authenticated layout as well, so signed-in users keep the shell.
  - Use "Go to my work" or "Go home" via `LandingRedirect` logic, and plain copy: "We couldn't find that page."
- **Effort:** Small.

#### F-15 · Invitation flow shows a raw token field and leaves the token in the URL — ✅ Resolved
- **Where:** `pages/AcceptInvitationPage.tsx:48,85-90`.
- **Category:** UX / Security · **Status:** Code-confirmed.
- **Problem:**
  - The invitee sees an editable "Invitation token" text field filled with an opaque secret.
  - Unlike `/forgot-password`, which strips its token (`ForgotPasswordPage.tsx:35-39`), the invitation token stays in the address bar, in history, and in Referer headers.
- **Fix:**
  - Copy the forgot-password pattern: hold the token in state and `setParams({}, { replace: true })`.
  - Hide the field when a token came from the link. Show it only behind a "Paste a token instead" disclosure when no token is present.
- **Effort:** Small.

#### F-16 · Single 5,363-line stylesheet with 12 breakpoints and loose type sizes
- **Where:** `styles/global.css`.
- **Category:** UI / Maintainability · **Status:** Confirmed.
- **Problem:**
  - 12 distinct `max-width` breakpoints: 340, 480, 560, 640, 760, 780, 900, 980, 1180 and others.
  - 17 font-size values, including 10.5, 11.5, 12.5 and 13.5 px, set directly instead of tokens. 61 rules use 12 px and 17 use 11 px, which is small for dense dashboards.
  - Components and their CSS live in different places, so dead rules are hard to find.
- **Fix:**
  - Add type tokens (`--fs-xs: 12px; --fs-sm: 13px; --fs-md: 14px; --fs-lg: 16px; --fs-xl: 20px; --fs-2xl: 26px`) and three breakpoints (`sm 640`, `md 980`, `lg 1180`) as documented custom-media or Sass-free conventions.
  - Then split the file by feature (`shell.css`, `forms.css`, `tables.css`, `kanban.css`, …) without changing any selector.
- **Effort:** Medium (mechanical).

#### F-17 · Dead and duplicated UI components
- **Where:**
  - **Unused** (0 imports): `components/ui/EmptyState.tsx`, `ErrorState.tsx`, `Spinner.tsx`, `Table.tsx`, `Input.tsx`, `Select.tsx`, `primitives.tsx`, `states.tsx`.
  - **Hand-built `<table>`s** outside `DataTable`: `ApprovalsCard`, `ClientDetailPanel`, `ClientHealthCard`, `ContentPlansCard`, `InternalApprovalsCard`, `OverdueLeadsModal`, `TeamWorkloadCard`, `ResponsibilitiesPage`.
- **Category:** Frontend · **Status:** Confirmed.
- **Problem:** Developers (and AI agents) import the wrong one. `Input` and `Select` exist in both `Fields.tsx` and their own files. The README still advertises the legacy files.
- **Fix:**
  - Delete the 8 unused files.
  - Give `DataTable` a `compact` / `paginate={false}` mode, then move the admin widget tables onto it, or onto a shared `SimpleTable` that has the same mobile `data-label` stacking.
- **Effort:** Small (deletion) + Medium (tables).

#### F-18 · Tasks filter bar wraps awkwardly at 1024 px
- **Where:** `/tasks` filter card.
- **Category:** Responsive / UI · **Status:** Confirmed (screenshot at 1024×768).
- **Problem:** Search, Status and Priority fill one row. "Type" drops to a second row alone, and the Board/Table toggle sits on a third. About 220 px of filters come before any task.
- **Fix:** Use `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` for the fields, and place the view toggle in the page header actions or the scope row.
- **Effort:** Small.

#### F-19 · Mobile pages show stat tiles before the work
- **Where:**
  - `/leads`: 4 follow-up tiles plus 7 pipeline tiles, about 650 px at 375 px wide.
  - `/tasks`: 3 tiles plus the filter panel.
  - `/my-work`: 3 tiles in a 2+1 layout plus the banner.
- **Category:** UX / Responsive · **Status:** Confirmed (screenshots at 320/375).
- **Problem:**
  - The first lead or task is two or more screens down.
  - The 7-stage pipeline grid leaves an empty bordered cell at the bottom right.
  - A zero shown in warning colour ("Due today 0" in orange) draws attention to nothing.
- **Fix:**
  - On phones, collapse KPI rows into one horizontally scrolling strip, or a single summary line.
  - Make the pipeline a scrollable chip row.
  - Use the neutral colour for zero values.
  - Hide the empty grid cell (`:empty` / odd-count handling).
- **Effort:** Medium.

#### F-20 · My Work repeats the same summary
- **Where:** `pages/MyWorkPage.tsx:186,251-256`.
- **Category:** UX · **Status:** Confirmed.
- **Problem:** The tiles say "This week 3". Below them, a summary line says "3 this week", and the section header says "This week (3)". That is three statements of the same number in about 200 px.
- **Fix:** Remove the summary line when the tiles are visible, or keep it only on mobile in place of the tiles (see F-19).
- **Effort:** Small.

#### F-21 · Detail pages: "Back" button below the subtitle; long stepper first on mobile
- **Where:** `/posts/:id` (also the task and lead detail pages).
- **Category:** UI / UX · **Status:** Confirmed at 320 px.
- **Problem:**
  - "Back to posts" is a full button placed after the H1 and description, which is not where people look for back navigation.
  - The 4-step approval stepper takes about 400 px before the post content.
- **Fix:**
  - Use a small breadcrumb or back link above the H1, consistent on all detail pages.
  - On phones, collapse the stepper to "Step 2 of 4 · Client review" with an expander.
- **Effort:** Small–Medium.

### P3 — Low / polish

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| F-22 | Topbar search at 320 px (19×32 px); Notification preference checkboxes (13×13); Automations toggles (40×22) | Touch targets under 24 px (WCAG 2.5.8) | Minimum 24×24 hit area; 44×44 on `pointer: coarse` via padding or a pseudo-element | S |
| F-23 | `CommandPalette.tsx:67` | Shows the Mac "⌘K" glyph on Windows while the label says Ctrl+K | `navigator.platform`/`userAgentData` check → "Ctrl K" | S |
| F-24 | Sidebar labels vs H1 | "Leads CRM" → "Leads", "Content posts" → "Content posts", "Client overview" → client name, "Responsibilities" → "Responsibility matrix" | Make each nav label match its H1 | S |
| F-25 | `Sidebar.tsx:138` | The logo links to `/dashboard`, but staff land on `/my-work` | Link to `/` (LandingRedirect) | S |
| F-26 | `LoginPage.tsx:35` | Post-login return keeps only `pathname`, so `?status=…` filters and hashes are lost | Store and restore `pathname + search + hash` | S |
| F-27 | Forms (Create task etc.) | Required fields aren't marked; "Optional" appears only on some fields | Use a single convention: mark the minority (usually "Optional") everywhere, and add `aria-required` | S |
| F-28 | `WaitingBanner` | Shown on every page and can't be dismissed; costs about 60 px on mobile | "Snooze for today" (per user, localStorage) | S |
| F-29 | Login | No "show password" toggle (the reset form has one) | Reuse the same control | S |
| F-30 | `index.html:25` | Open TODO: no `apple-touch-icon` / web manifest | Export a 180 px PNG and a minimal `manifest.webmanifest` | S |
| F-31 | Lint | 20 `react-refresh/only-export-components` warnings (contexts and Button export hooks/constants) | Move `useX` hooks and constants into sibling files; then make lint fail on warnings (`--max-warnings 0`) | S |
| F-32 | `index.html` | Inter is loaded from Google Fonts: a third-party request and a possible GDPR question for EU clients | Self-host Inter (woff2, 3 weights) | S |
| F-33 | Typography | 11 px / 10 px text used for meta (17 + 3 rules) | Minimum 12 px; check muted-text contrast at that size | S |

### Found during the fixes

| ID | Where | Status | Problem | Fix | Effort |
|---|---|---|---|---|---|
| N-3 (P2) | `.notifications-panel` (`global.css`, around line 1896) | Verified at 375 px: the panel spans x −21 to 323 | The panel is anchored to the bell's right edge with `width: min(400px, 100vw - 32px)`. On phones the bell sits about 54 px in from the right, so the panel runs off the left edge. The phone e2e test holds only the right edge until this is fixed. | Below 640 px, use `position: fixed; inset-inline: 16px; top: var(--topbar-h)` | S |
| N-1 (P3) | `tsconfig.json` (`include: ["src"]`) | Verified | `vite.config.ts`, `playwright.config.ts` and `e2e/` are never type-checked | Add a `tsconfig.node.json` to `npm run typecheck` | S |
| N-2 (P3) | `hooks/useAsync.ts` (`refetch`) | Code-confirmed | `useCallback(…, [query])` changes identity every render | Depend on `query.refetch` | S |
| N-4 (note) | Dialogs | Rule | A field inside a dialog must not use `autoFocus` at open: it takes focus before the trap can record the opener, so focus cannot return on close. `Modal` now focuses the first field itself. `autoFocus` on a field revealed mid-dialog is fine. | — | — |

---

## 4. Frontend technical audit (summary)

| Area | Assessment |
|---|---|
| Architecture | Clear layers: `config/` → `lib/http` → `services/` → hooks → pages. Context use is sensible (Auth, Company, Notifications, Theme, Locale). Weakest point: demo mode woven through services (F-06). |
| Routing | Good: route-level splitting, nested guards, public routes isolated, chunk-reload recovery. Gaps: F-04, F-14. |
| Data fetching | TanStack Query with a semantic key registry and sensible retry and staleness. The `useAsync`/`useMutation` wrappers add in-flight de-duplication (good), but hide React Query's API from new developers, and `refetch` depends on the whole `query` object, so it changes identity on every render. Gap: F-11. |
| Error handling | Strong normaliser (`normalizeApiError`): it separates API from proxy responses, maps field errors and detects missing routes. Gap: 404 vs error at page level (F-07). |
| Auth & security | Token in memory only, httpOnly refresh, single-flight refresh, cross-tab broadcast, cache cleared on identity change, no `dangerouslySetInnerHTML`, `noindex`. Gaps: F-02, F-12, F-15. |
| Forms | RHF + Zod across 20 forms, first invalid field gets focus, server field errors are mapped, discard guards, `useFormDraft`. Gaps: F-01, F-09, F-27. |
| Type safety | Strict; 3 `any`; 6 justified `eslint-disable` lines. `types/domain.ts` is 1,482 lines. Consider splitting it per domain (long term). |
| Performance | Good chunking; React 164 kB / data 94 kB / forms 87 kB raw (54/32/24 kB gzip). `index` 134 kB includes demo fixtures (F-06). No list virtualisation, but Kanban pages at 20 per column and tables at 10 per page. |
| Testing | 306 unit/integration tests and Playwright demo plus read-only live suites. Missing: a test for Escape across nested dialogs (F-01) and a focus-order test for the drawer (F-03). |
| i18n / RTL | Only navigation strings are in `messages.ts` (82 keys); all page copy is hard-coded English. CSS mostly uses logical properties (31 logical vs 1 physical), which is good groundwork. |

## 5. UI/UX audit (summary)

**Strengths:**
- A restrained, consistent visual language: one accent, neutral ramp, 8 px rhythm, consistent radii (`--r-md` dominant).
- Good empty and expired states, for example the public report "This link is not valid".
- Copy that explains *why* ("Waiting on Demo User · 1d").
- Dark mode is first-class.

**Weaknesses:**
- Overlay and keyboard behaviour (F-01, F-03, F-08, F-09).
- Repeated information (F-20).
- Stats before work on mobile (F-19).
- Navigation and heading naming drift (F-24).
- Back-navigation pattern (F-21).
- No required-field convention (F-27).
- Dead ends for missing records (F-07) and no-client users (F-04).

## 6. Responsive audit (summary)

| Width | Result |
|---|---|
| 320 | No page-level horizontal overflow on 25 routes. Issues: F-10 (clipped segmented control), F-19 (density), F-22 (targets), company name truncated in topbar (acceptable). |
| 375 | Same as 320. Drawer works visually but fails focus rules (F-03). |
| 768 | Drawer layout. Kanban columns and the Employees table scroll inside their containers (intended; the swipe hint is shown on phones only). The off-canvas nav is focusable (F-03). |
| 1024 | Sidebar is visible. Tasks filter bar wraps poorly (F-18). Kanban is cut at the right edge (scrolls; acceptable). |
| 1440 | Good. |
| 1920 | **Not verified.** |

---

## 7. Roadmap

**Immediate (this sprint; all Small):**
1. F-02 dev env off production.
2. F-01 modal stack and safe focus on danger confirms.
3. F-05 `aria-pressed`.
4. F-03 drawer focus and `visibility`.
5. F-04 loading vs no-company states.
6. F-07 `RecordNotFound`.

**Short-term (next 2–3 sprints):**
- Accessibility: F-08, F-09, F-22, F-27.
- Responsive: F-10, F-18, F-19.
- UX polish: F-20, F-21, F-24, F-25, F-26.
- Tech debt: F-11, F-12, F-13, F-14, F-15, F-17 (delete files), F-31.

**Long-term:**
- F-06 demo mode as an adapter.
- F-16 CSS split and tokens.
- F-17 table consolidation.
- Split `types/domain.ts`.
- Full i18n extraction if Arabic is a business goal.
- Add axe-core to the Playwright demo suite, a Lighthouse budget in CI, and a 1920 px plus 320 px evidence matrix.

**Quick wins (≤ 1 hour each, high impact):** F-02, F-05, F-01 (focus part), F-03 (`visibility` part), F-23, F-25, F-12, deleting the 8 dead files.

## 8. Top 10 highest-impact fixes

1. F-01: Escape/Enter on discard confirm (prevents silent data loss)
2. F-02: dev no longer talks to production
3. F-03: mobile/tablet keyboard navigation
4. F-04: no blank screen for new employees
5. F-07: useful not-found states
6. F-05: screen readers can tell which filter is active
7. F-19: work before stats on mobile
8. F-09: focus the first field in dialogs
9. F-06: remove demo code from production
10. F-17 + F-16: one table and one type scale, so the design system stops drifting

## 9. Suggested component refactoring

| Component | Action |
|---|---|
| `Modal` | Add a modal stack (Escape and top-most handling); focus the first body field by default; optionally `aria-describedby`. |
| `ConfirmDialog` | For danger tone, focus Cancel by default. |
| `DashboardLayout` / `Sidebar` / `Topbar` | Drawer becomes a modal dialog when open and inert/hidden when closed; hamburger gets `aria-expanded`/`aria-controls`. |
| `SegmentedControl` | `aria-pressed`; wrap or fade on phones. |
| `NotificationsDropdown` | Disclosure pattern instead of `role="menu"`. |
| `DataTable` | Add `compact` and `paginate={false}`; absorb the 8 hand-built tables. |
| `State.tsx` | Add `RecordNotFound` (H1, back link, page title). |
| `useAsync` | Make `queryKey` required; remove the `toString()` fallback. |
| `useClientView` / `AgencyRoute` / `LandingRedirect` | Separate `loading` from `hasCompany`. |
| `components/ui/*` legacy | Delete the 8 unused files. |
| Services + `demoStore` | Move to a demo HTTP adapter (incremental). |

## 10. Definition of Done (major fixes)

| Fix | Acceptance criteria |
|---|---|
| F-01 | With a dirty Create-task form: Esc opens the confirm; Esc again closes only the confirm, and the title value is kept. Focus is on "Keep editing" when the confirm opens. Covered by a Vitest + Testing Library test. |
| F-02 | `npm run dev` with the committed env files makes **no** request to `api.solu1ions.tech`, checked in the network panel. |
| F-03 | At 375 and 768 px, the first Tab from page load lands on the skip link and then topbar controls, never a hidden nav link. Opening the menu focuses inside it, Tab cycles within it, Esc closes it and focus returns to the hamburger, and the hamburger reports `aria-expanded`. Playwright test added. |
| F-04 | A user with 0 memberships sees an explanatory empty state at `/` (not blank). A client user deep-linking to `/leads` triggers no `/leads` API request (Playwright network assertion). |
| F-05 | Every `SegmentedControl` option has `aria-pressed`, and exactly one is `true`. Unit test. |
| F-06 | A production build contains no demo fixture strings (`grep "Nour Clinic" dist/assets/*.js` is empty). All existing tests and e2e demo tests still pass with `VITE_DEMO_MODE=true`. |
| F-07 | `/tasks/unknown`, `/posts/unknown`, `/leads/unknown`, `/campaigns/unknown`, `/content-plans/unknown` and `/reports/unknown` each show, in < 1 s, an H1 "X not found", a back link to the list, and a tab title naming the missing record. No Retry button. |
| F-10/F-18/F-19 | At 320, 375, 768 and 1024 px, no control is clipped without an affordance; the first list item on `/leads`, `/tasks` and `/my-work` is visible within 1.5 viewport heights at 375 px. Evidence screenshots refreshed. |
| F-16/F-17 | 0 imports of deleted files; build passes; font sizes come only from `--fs-*` tokens (stylelint rule or grep check in CI). |
| All | `npm run lint` (with `--max-warnings 0` once F-31 lands), `typecheck`, `test:run`, `e2e` and `build` all pass. |
