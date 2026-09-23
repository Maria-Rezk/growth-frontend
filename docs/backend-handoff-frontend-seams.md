# Backend handoff — Growth OS frontend seams

**For:** Backend · **From:** Frontend / Product · **Date:** 20 September 2026
**Frontend state:** `develop`, commits `c360570`–`be1e7db`

The frontend is built up to five backend seams. Each section below is one ticket: what the UI already does, the contract it expects, and how to verify it. Nothing in the frontend changes when these land — only the data source behind it.

Living copy (comment there): https://claude.ai/code/artifact/40db8073-4338-43c4-8eec-9d82846993ba

---

## Confirm first

Four things the frontend already assumes. Each is a yes/no; a no is a small change on either side.

| # | Question | What the frontend does today | If the answer is no |
|---|---|---|---|
| A | Can **every membership role** (incl. `CLIENT_OWNER`, `CLIENT_REVIEWER`, `SALES_AGENT`, `COPYWRITER`) call `POST /companies/:id/files/upload` and attach to a task? | Shows the upload picker to all roles | Tell us the allowed set; we narrow `assets:upload` in one line |
| B | Tasks that were already `IN_REVIEW` before the approval release have `approverId: null`. Will you **backfill** from the matrix, or should admins name approvers by hand? | Shows a "Needs an approver" tile and marker; blocks submit | Admins work the list manually — fine, just say so |
| C | Task comments arrive as `{ comment, userId }`. Confirm that is stable, and whether `user` is ever embedded. | Normalises `comment→body`, `userId→authorId`, accepts embedded `user` | Send the final shape; the normaliser is one function |
| D | Should a **client-side user** receive `DRAFT` / `IN_INTERNAL_REVIEW` posts from `GET /companies/:id/posts`? | Shows whatever the API returns; the client portal lists every status | Filter server-side by the caller's role — the frontend must not be the only thing hiding drafts |

---

## 1. Cross-client approval queue

**Why:** an approver on five clients has five queues. The frontend already merges them by calling `GET /companies/:id/tasks/approval-queue` once per membership (`myReviewsService.listAcrossClients`). One endpoint replaces N calls and gives correct server-side paging.

```http
GET /api/me/approval-queue?limit=25&offset=0
```

**Who:** any internal member. **Returns 200:**

```jsonc
{
  "items": [
    {
      // the full task object, exactly as GET /companies/:id/tasks/:taskId returns it
      "id": "9f1c…", "companyId": "2b7d…", "title": "…", "status": "IN_REVIEW",
      "approverId": "<caller>", "submittedForReviewAt": "2026-09-19T08:12:04.512Z",
      "assignedTo": { "id": "…", "fullName": "…", "email": "…", "status": "ACTIVE" },
      // NEW on this endpoint only — the row needs the client's name without a second lookup
      "company": { "id": "2b7d…", "name": "Taxero" }
    }
  ],
  "total": 7, "limit": 25, "offset": 0
}
```

**Rules**

- `status = IN_REVIEW` and `approverId = caller`, across every company the caller is an active member of.
- Ordered by `submittedForReviewAt` ascending (oldest first). Same envelope as the per-client queue.
- Verdicts stay on the existing per-client endpoints (`POST /companies/:id/tasks/:taskId/approve` etc.) — the row carries `companyId`, so the frontend already sends them to the right client.

**Frontend seam:** `src/services/myWork.ts` → `myReviewsService.listAcrossClients` becomes one `http.get`. Nothing above it changes.

**Acceptance:** *Given* a user who is approver on tasks in three clients, *when* they call the endpoint, *then* all three appear in one list, oldest first, each with `company.name`, and a task where they are assignee but not approver does not appear.

---

## 2. Ageing notifications and the email digest

**Why:** the review flow records `submittedForReviewAt` but nobody is told when a review has waited. The frontend shows an in-app banner computed client-side; the notifications and the email are the backend's half.

### Two new notification types

They arrive through the existing `/api/notifications` feed. The frontend already has labels and icons for both.

| `type` | Goes to | When | `message` example |
|---|---|---|---|
| `REVIEW_WAITING_24H` | the task's approver | 24 h after `submittedForReviewAt`, task still `IN_REVIEW` | Jessika's "Taxero — May carousel" has waited a day for your review |
| `REVIEW_WAITING_48H` | the client's Account Manager(s) | 48 h after, still `IN_REVIEW` | "Taxero — May carousel" has waited two days on Omar Khaled |

**Object shape:** same as the existing task notifications — `entityType: "TASK"`, `entityId: <taskId>`, `metadata: { submittedForReviewAt, approverId, waitingHours }`.

**Rules**

- Exactly one notification per task per threshold. Re-submission after changes resets the clock (`submittedForReviewAt` is cleared and set again), so a task can earn a new 24 h notice after each round.
- Cancelled, approved or changes-requested tasks never fire (the clock is cleared on all three — already the case).
- A scheduled job every 15 minutes is enough; the thresholds are hours.

### Email digest

One email per user per day, 08:00 in the company's timezone, **only if** the user has at least one of: a task waiting on them as approver, a task of theirs sent back with changes in the last 24 h, or (client users) a post `READY_FOR_CLIENT` older than 48 h. Empty days send nothing.

Body: one line per item with the age and a deep link to `/tasks/:id` or `/posts/:id`. Respect the preferences in section 3 — a muted type is left out of the digest too.

**Frontend seam:** none for the notifications (`notificationMeta.tsx` already maps both types). The banner in `WaitingBanner.tsx` stays as the immediate in-app cue; it does not depend on this.

**Acceptance:** *Given* a task submitted Monday 09:00 and untouched, *when* Tuesday 09:00 passes, *then* the approver has exactly one `REVIEW_WAITING_24H` notification linking to the task; *when* Wednesday 09:00 passes, *then* each Account Manager on that client has one `REVIEW_WAITING_48H`; *when* the approver approves at any point, *then* no further notice fires.

---

## 3. Notification preferences

**Why:** the Notifications page has a per-type mute switch. It is stored in `localStorage` today, so it is per device and the digest cannot read it.

```http
GET /api/me/notification-preferences
PUT /api/me/notification-preferences
```

**Who:** the signed-in user, own preferences only. **Shape (both directions):**

```jsonc
{
  "mutedTypes": ["TASK_STATUS_CHANGED", "POST_COMMENTED"], // any NotificationType; unknown values → 400
  "emailDigest": true                                         // default true; false = no digest email at all
}
```

**Rules**

- `GET` for a user with nothing saved returns `{ "mutedTypes": [], "emailDigest": true }` — never 404.
- `PUT` replaces the whole object (not a patch) and returns it.
- Exclude muted types from `GET /notifications/unread-count` and from `GET /notifications` unless `?includeMuted=true`. Otherwise the bell lights for things the user chose not to see. The frontend currently works around this by counting from the list; with server filtering that workaround goes.
- The digest (section 2) reads the same record.

**Frontend seam:** `src/context/NotificationsContext.tsx` → `readMuted` / `writeMuted` become the two calls; the list-based unread workaround is deleted.

**Acceptance:** *Given* a user who mutes `TASK_COMMENTED`, *when* a colleague comments on their task, *then* `unread-count` does not increase and the notification is absent from `GET /notifications`, but present with `?includeMuted=true`.

---

## 4. Post task chaining

**Why:** the post detail now shows its tasks as a pipeline (copy → design → client review → publishing) and creates the next stage pre-linked. The order is advisory: nothing stops design starting before copy is approved, and the post never moves on its own. This is the `sequence` ticket the approval-flow guide (§11) deferred.

### Product decisions (made — build to these)

1. **Request changes goes back one stage to the same person, never to the start.** Sent back on design, the copy task stays `DONE`. Reopening copy is a new task.
2. **The post does not go to the client automatically.** When the last internal stage is approved, the post moves to `READY_FOR_CLIENT` **only when the Account Manager presses Submit to client** (the existing `POST /posts/:id/submit-review`). The backend's job is to *allow* that press, not make it.

### Contract

| Change | Detail |
|---|---|
| `Task.sequence` | Integer, nullable. Only meaningful when `relatedEntityType = POST`. Set on create (`POST /tasks` accepts `sequence`), editable via `PATCH /tasks/:id`. Two tasks on one post may not share a value (409). |
| Blocking | A task with `sequence = n` cannot be **submitted for review** (`submit-for-review` → 409 `INVALID_TRANSITION`, `reason: "PREVIOUS_STAGE_OPEN"`) while any task on the same post with a lower `sequence` is not `DONE` or `CANCELED`. Starting work (`TODO`→`IN_PROGRESS`) is **not** blocked — people prepare in parallel. |
| Post gate | `POST /posts/:id/submit-review` → 409 `code: "STAGES_OPEN"` with `openTaskIds` while any linked task with a `sequence` is not `DONE`/`CANCELED`. Posts with no sequenced tasks are unaffected (today's behaviour). |
| Read model | `GET /posts/:id` gains `stages: { total, done, open: [{ taskId, title, sequence, status }] }` so the post page does not have to fetch the whole task list to draw the pipeline. |

**Frontend seam:** `src/components/domain/PostWorkPanel.tsx` reads `post.stages` instead of filtering `GET /tasks`; `useTaskReview` already switches on `code` and refreshes on 409, so `PREVIOUS_STAGE_OPEN` just needs a message.

**Acceptance:** *Given* a post with copy (`sequence 1`, `IN_PROGRESS`) and design (`sequence 2`), *when* the designer submits design for review, *then* 409 `PREVIOUS_STAGE_OPEN`; *when* copy is approved and design is then submitted and approved, *then* `stages.done = 2` and `submit-review` on the post succeeds; *when* the AM tries `submit-review` with design still open, *then* 409 `STAGES_OPEN` naming the design task.

---

## 5. Report share link

**Why:** `/reports/:id` is now a readable page with Copy link and Print-to-PDF. The copied link needs a login. Clients forward reports to people who have none.

```http
POST   /api/companies/:companyId/reports/:reportId/share      → 201 { "url": "https://app…/r/<token>", "expiresAt": "…" }
DELETE /api/companies/:companyId/reports/:reportId/share      → 204 (revokes; the link stops working)
GET    /api/public/reports/:token                              → 200 the report object, no auth
```

**Who:** create/revoke — Account Manager and admins. Read — anyone with the token.

**Rules**

- Token: ≥ 32 random bytes, URL-safe, stored hashed. One active token per report; a second `POST` returns the existing one.
- Expiry 90 days by default; `expiresAt` in the response so the UI can say so.
- The public read returns the same `Report` shape as the authenticated `GET`, plus `company: { name }`, minus anything internal (`createdById`, `notes` if you consider notes internal — say which).
- Rate-limit the public route; a wrong token is 404, never 403 (do not confirm a report exists).
- Log an activity row `REPORT_SHARED` / `REPORT_SHARE_REVOKED` with the actor.

**Frontend seam:** `src/pages/ReportDetailPage.tsx` gets a "Share publicly" button beside Copy link, and a small public route that renders the same page from `GET /public/reports/:token` without the app shell.

**Acceptance:** *Given* an AM shares a report, *when* someone opens the URL in a private window, *then* they see the report with no login; *when* the AM revokes it, *then* the same URL is 404 within a minute.

---

## Order of delivery

Smallest first; each one is usable the day it lands because the frontend is already waiting for it.

| Order | Ticket | Size | Unblocks |
|---|---|---|---|
| 0 | Answers to Confirm first A–D | — | Everything; two are one-line changes on either side |
| 1 | `GET /me/approval-queue` | S | Correct paging for approvers on many clients |
| 2 | Notification preferences endpoint | S | The digest, and a bell that respects mutes |
| 3 | `REVIEW_WAITING_*` notifications + digest job | M | The product outcome: nothing waits silently |
| 4 | Report share link | M | Clients forwarding reports without a login |
| 5 | `sequence` + post gate | L | Automatic chaining; needs the two decisions above, which are made |

### How to verify against the frontend

- Point a build at staging (`VITE_API_BASE_URL`), sign in as an approver on ≥ 2 clients, open **Approval queue** — it should show the merged list with no fan-out once ticket 1 is live (check the network tab: one request).
- For ticket 3, submit a task and move the clock (or set `submittedForReviewAt` 25 h back): the bell shows the new type with its own label and icon.
- Every error the review endpoints return must carry `code` in the body; the frontend switches on it, never on `message`. Any new 409 needs a `code`.
- The contract for the approval flow itself stays the document dated 19 September 2026; nothing here changes it.

---

## 6. Added after the second frontend batch (commits `5f190e6`–`be1e7db`)

Three more seams, each already handled gracefully by the frontend until it lands.

### 6a. `campaignId` on posts and leads

**Why:** the campaign page (`/campaigns/:id`) lists the posts, leads and tasks attached to a campaign by reading `campaignId` on each record. Tasks carry it; posts and leads do not, so today the page shows the overview *counts* and says it cannot name the records.

**Change:** include `campaignId: string | null` on every item of `GET /companies/:id/posts` and `GET /companies/:id/leads` (and on the single-record reads). Set by the existing attach/detach endpoints.

**Frontend seam:** none — `CampaignDetailPage` already reads the field and drops the notice when it is present.

**Acceptance:** *Given* a post attached to campaign C, *when* the posts list is fetched, *then* that post has `campaignId = C`; *when* detached, *then* `null`.

### 6b. Forgot / reset password

```http
POST /api/auth/forgot-password   { "email": "…" }              → 200 always
POST /api/auth/reset-password    { "token": "…", "password": "…" } → 200 | 400 (expired/invalid token)
```

**Rules**

- `forgot-password` answers 200 whether or not the email has an account, and never says which — the page shows the same "if that address has an account…" copy either way.
- The email links to `https://<app>/forgot-password?token=<token>`. Token single-use, valid one hour.
- Neither endpoint requires or refreshes a session; the frontend excludes both from the 401-refresh interceptor.
- Password rule: ≥ 8 characters (frontend enforces the same minimum).

**Frontend seam:** none — `ForgotPasswordPage` calls both; until they exist a route miss renders "not available on this server yet, ask an admin".

### 6c. Lost reason and deal value on leads

**Why:** Lost now asks *why* (Price / Timing / Went elsewhere / No response / Not a fit / Other) and the CRM stores it as a `[Reason]` prefix on the status-change note. Won has nowhere to record value. Reports cannot aggregate either.

**Change:** `PATCH /leads/:id/status` accepts optional `lostReason` (enum as above, only with `status = LOST`) and `dealValue` (number, only with `status = WON`); both returned on the lead. Reports gain `leads.byLostReason` and `leads.wonValue`.

**Frontend seam:** `LeadDetailPage.applyStatus` sends `lostReason` instead of prefixing the note; a value field appears on Won. One small change.

### Delivery order, updated

| Order | Ticket | Size |
|---|---|---|
| 0 | Confirm first A–D | — |
| 1 | `GET /me/approval-queue` | S |
| 2 | Notification preferences | S |
| **2b** | **`campaignId` on posts and leads** | **XS** |
| **2c** | **Forgot / reset password** | **S** |
| 3 | Ageing notifications + digest | M |
| 4 | Report share link | M |
| **4b** | **`lostReason` / `dealValue`** | **S** |
| 5 | `sequence` + post gate | L |

---

## 7. Added for the browser-persistence pass (session 23 September 2026)

Two items, neither blocking — the frontend degrades safely if the answer to either is "not yet."

### 7a. Confirm the refresh cookie's flags

**Why:** the access token used to live in `localStorage` (any script on the page could read it, and it survived indefinitely). It's now held in memory only and re-minted from the refresh cookie on every page load — which makes that cookie the entire client-side security boundary, so its flags matter more than they did before.

**Ask:** confirm `Set-Cookie` on `/auth/login` and `/auth/refresh` already sends `HttpOnly; Secure; SameSite=Lax` (or `Strict`) — the frontend has always assumed `HttpOnly` (it never reads the cookie) but cannot verify the rest from here. If refresh tokens don't already rotate on each use (a new cookie value per `/auth/refresh` call, the old one rejected if replayed), that's the other half of "proper expiration, rotation and renewal" worth confirming.

### 7b. `POST /auth/logout`

**Why:** today, clicking "Logout" only clears client-side state — the refresh cookie itself is never revoked, so a copy of it (stolen, or simply not cleared by a shared computer's next user) is still good for new access tokens after "logout".

```http
POST /api/auth/logout   → 200 | 204, clears/invalidates the refresh cookie server-side
```

**Frontend seam:** `src/services/auth.ts` → `authService.logout()` already calls this on every explicit sign-out. It treats a route-miss as success (nothing shipped yet), so nothing breaks until this lands — but until it does, "Logout" is cosmetic against a copied cookie.

**Acceptance:** *Given* a signed-in session, *when* the person logs out and the same (now-stale) refresh cookie is replayed against `/auth/refresh`, *then* it is rejected.
