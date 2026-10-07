# Frontend ↔ backend contract: what is verified, what is not

**Source of truth:** `Solutions-Platform-API-Reference.md` (28 September 2026) and the companion guides (`Backend-Seams-Frontend-Guide.md`, `Task-Approval-Flow-Frontend-Guide.md`, `Frontend-Multiple-Roles.md`).

**Not available when this was written:** the backend source, a running backend, and test accounts. Everything below marked **UNVERIFIED** is therefore a *stated assumption*, not a tested fact. Each one is a one-line change in the file named beside it once confirmed.

## Where current-company roles come from

```
/auth/me  ->  sessionMemberships  ->  selected client  ->  roles on that client  ->  can(permission)
```

- `AuthContext` reads `/auth/me` and keeps its `memberships` apart from the user (`sessionMemberships`).
- `CompanyContext` derives, for a non-admin: the client list (ACTIVE memberships only) and the roles on the selected client. This is synchronous, so a client switch can never inherit the previous client's roles.
- Platform admins bypass company checks in the API, so their gates do not read roles (`useCan`, `usePermission`).
- **Fallback, only if `/auth/me` carries no memberships:** `GET /companies/:id/members`. That endpoint is **Account Manager / admin only** (reference §5; `Frontend-Multiple-Roles.md`), so every other role is refused. Then roles are unknown and the UI **fails closed** (no permissions) and says so (`rolesUnavailable`).

### REAL BACKEND CONTRACT GAP (blocker for non-AM, non-admin users unless confirmed)

The reference says `GET /auth/me` returns "the current user". It does not say it includes memberships. The project README lists "confirm `/auth/me` returns the user and memberships" as an open item. `GET /companies` is also listed as admin-only, so a non-admin has no documented way to learn which clients they belong to either.

**Needed from the backend:** `GET /auth/me` returns, alongside the user, the caller's own memberships:

```jsonc
{
  "id": "uuid", "email": "…", "fullName": "…", "platformRole": "USER",
  "memberships": [
    { "id": "uuid", "companyId": "uuid", "userId": "uuid",
      "roles": ["DESIGNER", "COPYWRITER"], "status": "ACTIVE",
      "company": { "id": "uuid", "name": "…" } }
  ]
}
```

If it already does, nothing else is required and the fallback can be deleted. If it does not, only Account Managers and admins can use the app correctly.

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

## Status codes and refresh

- **401** → refresh the session once and retry the original request once. A second 401, or a failed refresh, signs the person out. Concurrent 401s share one refresh.
- **403** → never refreshes. It is an authorization answer. The app quietly re-reads `/auth/me` (throttled to once a minute) so a role changed elsewhere reaches the UI.
- **UNVERIFIED:** whether the access token carries the role. If it does, a changed role only reaches the API when the 15-minute access token next refreshes; the UI is corrected sooner either way.

## Pagination

Lists that arrive as `{ items, total, limit, offset }` default to 25. Reference data and lists the screen groups itself (clients, employees, members, invitations, tasks board, posts board, campaigns, reports, leads for pickers) are fetched whole with `getAllItems` (100 per page, remaining pages in parallel, capped at 5,000 rows). The Leads screen and the cross-client approval queue use real server paging. A list that can legitimately exceed 5,000 rows needs server paging.
