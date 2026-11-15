# Automatic data synchronisation — Phase 1

Branch `feat/data-sync-phase1`, cut from `feat/release-integration` at `7992162`.
Frontend only. **Not committed, not pushed, not deployed.**

## Recommendation

**Do not deploy yet.** The implementation is complete and tested, but whether
it is safe in production depends on one backend setting nobody has confirmed:
whether the API trusts nginx's forwarded address (`trust proxy`). See
[Backend safety](#backend-safety). If it does, deploy as is. If it does not,
every user shares one rate-limit budget per endpoint and the limits below
apply.

## What changed

| File | Change |
|---|---|
| `src/lib/syncPolicy.ts` (new) | The whole policy: which query keys refresh on their own and how often, by explicit key shape; error and 429 backoff. |
| `src/lib/queryClient.ts` | The policy is every query's default `refetchInterval`. A 429 from any query starts a one-minute cooldown for all synced queries. 4xx (incl. 429) is never retried. |
| `src/hooks/useAsync.ts` | An explicit interval is passed only when a caller gives one, so the policy applies everywhere else. `refreshing` is now only for fetches the screen started itself (Retry, Show more, a refetch after its own change). A failed background refresh keeps the data on screen (`staleError`) instead of replacing the page with an error, except for 401/403/404/410. `setData` cancels an in-flight read of the same key first, so a read sent before a change cannot land after it. |
| `src/components/layout/WaitingBanner.tsx` | Opts out (`refetchInterval: false`). It is on every page and shares the Approval queue's key; without this, every page would poll. |
| `src/components/admin/ClientDetailPanel.tsx` | Client rename keeps what the admin is typing when the client list re-reads (`keepDirtyValues`), and the field is re-based on the saved name after a successful rename. |
| `src/lib/syncPolicy.test.ts` (new), `src/hooks/useAsync.test.tsx` | Unit tests (below). |
| `e2e/sync/*`, `playwright.sync.config.ts`, `npm run e2e:sync` (new) | The real build against a stubbed API, to count requests and check behaviour. |

Notification sync (`useNotificationSync`, `NotificationsProvider`) and
mutation-driven invalidation are untouched. Focus and reconnect refetching stay
on; polling is React Query's default foreground-only behaviour.

## The policy

| Screen | Query keys | Interval |
|---|---|---|
| Tasks — Board and Table | `['companies', id, 'tasks', filters, scope?]`, alert tiles `[…, 'alerts']` | 60 s |
| Task detail | the task, its comments, activity history, and its attachments (the activity rows name attachments) | 30 s |
| Approval queue | `['my-work', 'approval-queue', params]`, per-client `['companies', id, 'tasks', 'approval-queue', params]` | 30 s |
| Leads | list `['companies', id, 'leads', filters]`, follow-up tiles `[…, 'follow-up']` | 60 s |
| Leads — pipeline counts | `['companies', id, 'leads', 'counts', filters]` | **5 min** (see deviations) |
| My work | `['my-work', 'id|id|…', filters]` | 30 s × number of clients, between 1 and 5 min |

Every other key returns `false`. The unit tests pin each synced shape and a
catalogue of 50 keys that must not sync, including near misses (prefixes,
deeper paths, drafts, lead detail, notifications, admin widgets).

**My work interval.** One refresh sends one `GET /companies/:id/tasks/my` per
client (`myWorkService.listAcrossClients`). 30 s per client keeps an open My
work page at no more than 2 requests a minute on that endpoint, the same as
every other synced screen: 1–2 clients 60 s, 4 clients 2 min, 10 or more 5 min.

**Backoff.** After a failed refresh a query waits 4× its interval (max 5 min).
After a 429 it waits 5 min, and every synced query waits at least one full
rate-limit window (60 s). A refresh that succeeds returns to the normal
interval.

### Deviations from the brief

- **Lead pipeline counts refresh every 5 minutes, not 60 s.** The counts are
  one `limit=1` request per stage (seven), all to `GET /companies/:id/leads`.
  At 60 s a single open Leads page would send 9 requests a minute to that one
  endpoint. A lead change made in the app still refreshes them at once.
- **Task attachments are included** in Task detail, because the activity
  history names attachments from that list.
- **The waiting banner does not sync** (it is on every page).
- **"Updating…" no longer appears after a person's own change.** Only a refetch
  the screen asked for, or a new page/filter behind `keepPreviousData`, shows
  it. First-load skeletons and error states are unchanged.

## Measurements

The real build (demo mode off) against a stubbed API in Playwright, every
request recorded per endpoint. Five minutes of virtual time with the tab in
front and nobody touching it. "Before" is `7992162`, "after" is this branch.
Run with `npm run e2e:sync`; raw figures in `e2e/.artifacts/sync-measure-*.json`.

| Screen | Requests to load (before → after) | Background requests in 5 min, excl. notifications (before → after) | Per endpoint, after |
|---|---|---|---|
| Tasks board | 13 → 13 | 0 → 8 | `GET /companies/:id/tasks` ≈ 2/min (board + tiles) |
| Task detail | 15 → 15 | 0 → 40 | task, comments, activity, attachments: 2/min each |
| Approval queue | 10 → 10 | 0 → 10 | `GET /me/approval-queue` 2/min |
| My work, 1 client | 11 → 11 | 0 → 5 | `GET /companies/:id/tasks/my` 1/min |
| My work, 5 clients | 15 → 15 | 0 → 5–10 | 2/min at steady state (150 s interval) |
| My work, 10 clients | 20 → 20 | 0 → 10 | 2/min (5 min interval) |
| Leads | 20 → 20 | 0 → 15 | `GET /companies/:id/leads` ≈ 3/min |
| Reports (control, not synced) | 12 → 12 | 0 → 0 | — |
| Three sessions on Task detail | — | 0 → 112 | 5.6/min per endpoint for 3 sessions; no 429 |

- **Notifications:** 20 requests per 5 minutes before and after on every
  screen (9–10 per endpoint per run is timing jitter of the harness, seen in
  both directions on repeated runs).
- **Load cost unchanged:** every screen sends exactly the same requests to
  load as before.
- **No duplicates:** each synced endpoint is hit once per interval. A focus,
  reconnect or mutation refetch restarts the timer, so a poll never follows
  one straight away. Coming back to a hidden tab refreshes each query once,
  not once per missed tick.
- **No retry storms:** 429 and other 4xx are not retried; the 429 test shows
  at most 8 list requests in 10 minutes under a permanent 429 (it would be
  ~20 at 60 s) and never two in the same second.

## Behaviour verified (`e2e/sync/sync-behaviour.spec.ts`)

Each test changes data on the stubbed server behind the browser's back.

| Check | After | On `7992162` |
|---|---|---|
| Tasks board: another person's change appears; filter, URL and scroll position unchanged; "Updating…" never shown | pass | fail (never appears) |
| Table: new task appears; the person's Z–A sort holds | pass | fail |
| Task detail: a new comment and a renamed title appear; a half-typed comment keeps its text and focus | pass | fail |
| New-task dialog open with typing: stays open, keeps text; board refreshes behind it | pass | fail |
| A status change wins over a poll that was sent before it and answered after it | pass | fail |
| Server keeps answering 429: board stays on screen, no error page, backs off | pass | fail |
| Hidden tab: zero requests for 5 min; coming back refreshes once | pass | pass |
| Offline: zero requests, board stays; back online catches up once | pass | pass |
| Reports, Posts, Content plans, Responsibilities: zero polling | pass | pass |

Dirty forms: the comment box is local state; the task edit form is mounted only
while editing and initialised once; the client rename form now keeps dirty
values (above); Brand profile already resets only while pristine. None of the
synced queries feeds a form that resets on new data.

## Test results

- `npm run typecheck`: clean.
- `npx eslint . --max-warnings 0`: clean.
- `npx vitest run`: 635/635 (72 files) — includes 72 new policy tests and 7
  new `useAsync` tests. Five of the new `useAsync` tests fail on `7992162`
  (silent background refresh, kept data on failure, setData race, policy
  default); the mutation-race test passes there too, because invalidation
  already cancels an in-flight read — so no extra mutation handling was added.
- `npm run build`: passes, demo-free bundle check passes.
- `npm run e2e:sync`: 18/18 (9 behaviour + 9 measurement) on two consecutive
  runs. One earlier run failed the Tasks-board check once; it passed 3/3 alone,
  and the test now jumps to its scroll position instead of reading it while a
  wheel scroll could still be settling.
- `npx playwright test --project=demo` (full demo suite, accessibility specs
  included): 504/504.

## Backend safety

Read-only investigation; nothing on the backend was changed.

- **Live rate limit, from the API's own headers** (two unauthenticated
  `GET /api/auth/me`, one `GET /api/companies`, all 401):
  `X-RateLimit-Limit: 100`, `X-RateLimit-Reset: 60`. The remaining count fell
  99 → 98 → 97 on `/auth/me` while `/companies` started at 99: **one counter per
  endpoint**, 100 requests a minute.
- **Source** (`Maria-Rezk/CRM-PLATFORM`, read-only): a global `ThrottlerGuard`
  with `{ ttl: 60_000, limit: 100 }`, `@nestjs/throttler` ^6.5 (counter key =
  controller + handler + client address), `/auth/login` 5/min, `/auth/refresh`
  20/min, and `main.ts` never sets `trust proxy`. That repository is older than
  the deployed API (it has no `/me/approval-queue`), so it may not match what
  runs; the release doc's F-9, written from newer backend source, reports the
  same limits and the same missing `trust proxy`.
- **Unresolved:** whether the client address the API sees is the user's or
  nginx's. If it is nginx's, every user shares each endpoint's 100/min. That
  cannot be told from one network location without sending a forged
  `X-Forwarded-For` to production, which was not done.

### What polling costs, worst case (one shared bucket)

Each open, visible tab adds about 2 requests a minute to each endpoint its
screen syncs (Leads ≈ 3). With a shared 100/min per endpoint, polling alone
fills an endpoint at about 50 tabs open on the same kind of screen, and
everything a person does on that endpoint shares the rest. Allowing half the
budget for normal use, the safe ceiling is **about 25 concurrent visible tabs
per screen type** (e.g. 25 people with a task open). Above it, the first 429s
fall on real actions as well as polls; the backoff then stops polling for at
least a minute, so the API recovers, but those users see errors.

If the address is the user's own, each person's budget is per endpoint and
polling uses 2–3 of their 100 a minute: no risk.

### Before deploying

1. Backend owners confirm `app.set('trust proxy', …)` matches nginx (and that
   nginx sends `X-Forwarded-For`), or switch the throttler tracker to the user
   id for authenticated routes.
2. Or: accept the ~25 concurrent tabs per screen type ceiling for now.

## Open items

Two separate items, tracked apart from this change and from each other.

1. **Production rate limit (`trust proxy`) — blocks deploying Phase 1.**
   Unconfirmed whether the deployed API counts its 100 requests a minute per
   endpoint per user or once for everyone behind nginx (see
   [Backend safety](#backend-safety)). Owner: backend. Needs: confirmation of
   the `trust proxy` setting and nginx's `X-Forwarded-For`, or a per-user
   throttler tracker. Until then Phase 1 stays undeployed.
2. **Tasks page scroll freeze — separate fix, not in this branch.** The Tasks
   page could stop scrolling after "Discard" on the New task form (a dialog
   scroll lock left on `body`), and the last Kanban stages were out of reach
   on desktop. Fixed and tested on its own branch `fix/kanban-board-scroll`
   (worktree `growth-frontend-kanban-scroll`, cut from `7992162`). That work is
   **not committed yet** and is independent of Phase 1: neither branch
   contains the other. This branch does not touch `Modal.tsx` or the board.

## Unresolved risks

- **Shared rate limit** (open item 1): the deployment blocker.
- **Token refresh race (release doc F-8):** one refresh token per user; two
  visible tabs refreshing at the same moment can sign the user out
  everywhere. Notification sync already polls every 30 s in every visible tab,
  so this exposure exists today; Phase 1 adds no new refresh triggers, but more
  screens now make requests while idle.
- **No conflict detection on edits:** the task edit form is a snapshot from
  when it opened; saving overwrites changes made by others in the meantime
  (last write wins, as today). Sync makes the page behind it current, not the
  form.
- **Stale data is silent:** after a failed background refresh the data stays
  on screen with no indicator. `staleError` is available to show one.
- **Pre-existing, seen while measuring:** loading the app sends `/auth/me` and
  `/companies` twice each.
- The stub covers the response shapes these screens read; it is not a contract
  test. Live verification needs a test account (release doc §5).

## Phase 2 — recommendation

1. **Backend first:** trusted proxy or per-user throttling; a single
   cross-client "my tasks" endpoint (My work is N requests today); one lead
   counts endpoint (seven today); conditional requests (`ETag` /
   `If-None-Match` or `updatedSince`) so an unchanged poll costs a 304.
2. **Then extend** to Posts and Post detail, Lead detail, Content plans,
   Campaigns and the waiting banner, each as an explicit shape in
   `syncPolicy.ts` with its "must not sync" counterpart in the tests.
3. **Show staleness:** a small "Couldn't refresh — showing data from 2 min
   ago" note using `staleError`.
4. **Edit conflicts:** compare `updatedAt` on save and offer to reload.
5. **Longer term:** server push (SSE or WebSocket) for tasks and
   notifications, replacing polling where it matters most.
