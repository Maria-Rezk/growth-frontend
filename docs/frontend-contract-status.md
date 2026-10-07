# Frontend ↔ backend contract: what is verified, what is not

**Source of truth:** `Solutions-Platform-API-Reference.md` (28 September 2026) and the companion guides (`Backend-Seams-Frontend-Guide.md`, `Task-Approval-Flow-Frontend-Guide.md`, `Frontend-Multiple-Roles.md`).

**Not available when this was written:** the backend source, a running backend, and test accounts. Everything below marked **UNVERIFIED** is therefore a *stated assumption*, not a tested fact. Each one is a one-line change in the file named beside it once confirmed.

## Where current-company roles come from

Authentication and company authorization are separate concerns, and separate endpoints:

```
GET  /auth/me           ->  who is signed in (the user only; AuthContext)
POST /auth/refresh      ->  user + accessToken
GET  /companies         ->  which clients to list
GET  /me/memberships    ->  this person's roles, per client (CompanyContext)

selected client + this person's membership for it  ->  roles  ->  can(permission)
GET  /companies/:id/members  ->  managing people only (Members page); never used to learn the current person's roles
```

**Contract the frontend consumes** (deployment depends on `/me/memberships` existing):

```jsonc
// GET /api/me/memberships   (any authenticated user; the caller's own ACTIVE memberships)
{
  "memberships": [
    { "id": "uuid", "companyId": "uuid", "roles": ["DESIGNER", "COPYWRITER"], "status": "ACTIVE" }
  ]
}
```

- ACTIVE only (suspended and invited are absent); `roles` is the effective multi-role array. A platform admin may have `[]` and still passes every company check. Company roles are not in the JWT.
- `GET /api/companies` is open to every signed-in user: all clients for a platform admin, the person's ACTIVE clients otherwise.

How the frontend uses it:

- `AuthContext` is unchanged by this: login, refresh, logout, 401 handling and the `/auth/me` read all behave as before, and the user has no membership field. `/auth/me` is read as the user, bare or wrapped as `{ user }`.
- `CompanyContext` loads the client list from `GET /companies` and the memberships from `GET /me/memberships` (`membershipsService`), cached under `['me', 'memberships', userId]`. The whole query cache is dropped when the signed-in identity changes, so one person's roles are never served to the next.
- The roles for the selected client are the roles on its membership, derived synchronously, so a client switch can never inherit the previous client's roles. No membership for the client means no roles. The memberships are read once, not per client.
- Platform admins bypass company checks in the API, so their gates do not read roles (`useCan`, `usePermission`), and no membership is invented for them. A failed membership read never blocks an admin.
- **Fail closed:** for anyone else, roles that are not loaded and not being loaded are *unknown* (a failed or malformed `/me/memberships`, a paused retry). They get no permissions and a notice with a retry (`rolesUnavailable`). A body that is not `{ memberships: [...] }` is an error, never an empty list. Nothing falls back to the member directory.
- Until the memberships are known, a non-admin is not "ready" (`loading`), so a client-only person never sees the agency app flash by.

## Status codes and refresh

- **401**: refresh the session once and retry the original request once. A second 401, or a failed refresh, signs the person out. Concurrent 401s share one refresh.
- **403**: never refreshes the token and never replays the request. The app quietly re-reads the user (`/auth/me`) and marks the memberships stale so they refetch (single-flight, at most once a minute), so a role changed elsewhere reaches the UI.

## Automations — **UNVERIFIED** (`src/services/automations.ts`)

Reference gives routes, roles and enums only:

| | Assumed |
|---|---|
| `POST /companies/:cid/automation-rules` | body `{ name, triggerType, actionType, isActive }` |
| `PATCH /companies/:cid/automation-rules/:id` | body `{ name?, isActive? }` |
| rule row | `{ id, companyId, name, triggerType, actionType, isActive, createdAt, updatedAt }` |
| `GET …/automation-runs` | query `status`, `ruleId`, `limit`, `offset` |
| run row | `{ id, ruleId, rule?: { name }, status: SUCCESS \| FAILED, triggerType, actionType, entityType, entityId, error, createdAt }` |
| enums | only `POST_CHANGES_REQUESTED → CREATE_POST_CHANGES_TASKS` and `LEAD_BECAME_INTERESTED → CREATE_LEAD_FOLLOW_UP_TASK` (from the reference); the UI offers nothing else |

The normalisers also accept `active`/`enabled`, `trigger`/`action`, `errorMessage`, `success`. Confirm the real names and delete the rest. The dashboard's automations widget (`AutomationFailure`, `AutomationsSummary`) comes from the same backend and uses `trigger`, `action`, `error`, `activeRules` — a hint the run row may use `trigger`/`action`.

## Post assets — **UNVERIFIED** (`src/services/postAssets.ts`)

| | Assumed |
|---|---|
| `POST /companies/:cid/posts/:postId/assets` | body `{ fileId, assetType, label? }` |
| `DELETE …/assets/:assetId` | – |
| row | `{ id, postId, assetType, label, uploadedById, uploadedBy, createdAt, file: { id, originalName, mimeType, size } }` |
| `assetType` | `DESIGN \| REFERENCE \| VIDEO \| THUMBNAIL \| DOCUMENT` (from the reference) |

Files are opened through `GET …/files/:fileId/download-url` (signed, 15 minutes), as for every other attachment.

## Reports — verified against the reference, per operation

| Operation | API roles | Frontend permission |
|---|---|---|
| overview | Account Manager, Client Owner | `reports:view` |
| list, detail | Account Manager | `reports:list` |
| generate monthly | Account Manager | `reports:generate` |
| public share (create, rotate, revoke) | Account Manager | `reports:share` |
| public report by token | none | login-free `/r/:token` |

**Open question for the product owner:** the client portal used to show a client their latest report in-app. The API does not let a client call the list, so it now points them to the link their Account Manager shares.

## Product policy that is stricter than the API (not bugs)

| | API | App |
|---|---|---|
| Edit brand profile | any member of the client | Account Manager (`brand:edit`) |
| AI generation | any member | Account Manager, Social Media Manager, Copywriter (`ai:generate`) |

Both live in one place, `src/utils/permissions.ts`, with a comment. Viewing the brand profile is open to every member, and the form is read-only for everyone who cannot save it.

## Pagination

Lists that arrive as `{ items, total, limit, offset }` default to 25. Reference data and lists the screen groups itself (clients, employees, members, invitations, tasks board, posts board, campaigns, reports, leads for pickers) are fetched whole with `getAllItems` (100 per page, remaining pages in parallel, capped at 5,000 rows). The Leads screen and the cross-client approval queue use real server paging. A list that can legitimately exceed 5,000 rows needs server paging.
