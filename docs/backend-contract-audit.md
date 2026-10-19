# Backend contract audit — 19 October 2026

**Backend source read:** `manaf88/CRM-PLATFORM`, branch `task-draft`, through the public
GitHub API and raw file URLs (read-only, no clone). 160 source files read: every controller,
DTO, enum, guard and decorator, plus `main.ts`, `app.module.ts`, the membership service and
entity, and the frontend guides in `docs/`.

**Not established:** which commit is deployed at `https://api.solu1ions.tech`. Everything
below is true of `task-draft`; the deployed API may be older. The unauthenticated probe in
`frontend-contract-status.md` agrees with it on every route checked.

## How requests are validated

- Global prefix `api`. CORS with credentials, an explicit origin allow-list.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. **Any
  property a DTO does not declare is a 400** — in a body, and in a query string bound with
  `@Query() dto`. This rule is behind most of the defects found below.
- Guards, in order: `JwtAuthGuard` → `CompanyAccessGuard` (active membership on
  `:companyId`, or a platform admin) → `CompanyRolesGuard` (any held role in the list, or a
  platform admin) → `PlatformRolesGuard` where a route is admin-only.
- Company roles are read from the database on every request; they are not in the JWT.

## Routes

155 API routes across 31 controllers (plus `GET /`). Every path the frontend calls exists,
**except `GET /me/memberships`** (see below). Role requirements match `src/utils/permissions.ts`
except where the frontend is deliberately narrower (listed at the end).

## Membership discovery — root cause

`GET /me/memberships` **does not exist on `task-draft`**, and nothing else gives an ordinary
employee their own company roles:

| Candidate | What it returns | Usable for self-roles? |
|---|---|---|
| `GET /auth/me` | `{ user: { id, email, fullName, platformRole } }` | No roles |
| JWT payload | `{ sub, email, platformRole }` | No roles (by design) |
| `GET /companies` | Bare company records | No roles |
| `GET /companies/:id/members` | Every membership with `roles` | **Account Manager or admin only** |
| `GET /users` | Employees with per-client `roles` | **Admin only** |
| `@Controller('me')` | Only `approval-queue` and `notification-preferences` | No |

**Conclusion:** the backend has no self-membership contract. The frontend's call is correct
against its documented contract; the endpoint was never built. Using the restricted routes for
ordinary employees would be a permission bypass, so the frontend does not. Consequence on a
deployment of this branch: platform admins work fully; every other user sees "Your role on this
client cannot be read from this server yet" and role-gated actions are hidden (fail closed).

**Backend dependency:** `GET /api/me/memberships` returning
`{ memberships: [{ id, companyId, roles: CompanyMembershipRole[], status }] }` — the caller's own
ACTIVE memberships, any authenticated user. The service already has
`findActiveMembershipsForUser(userId)`; the route is the missing piece.

## Defects found and fixed in the frontend

| Severity | Area | Backend source | Defect | Fix |
|---|---|---|---|---|
| P1 | Invitations | `CreateCompanyInvitationDto`: `email`, required `role`, `fullName?` | Frontend sent `roles: [...]` → 400 on every invitation | One role per invitation; the form is a single select (`MembersPage.tsx`, `invitations.ts`) |
| P1 | Content posts list | `FindContentPostsQueryDto`: `contentPlanId, status, platform, contentType` only; endpoint not paginated | Paging helper sent `limit`/`offset`; list and command palette sent `search` → 400 | Send only the four declared filters; search applied client-side (`content.ts`) |
| P1 | Tasks with no type | `CreateTaskDto.taskTypes`: optional, `@ArrayMinSize(1)` | An empty selection was sent as `[]` → 400 (including drafts) | Omit when empty; editing keeps at least one type once a task has one (`tasks.ts`, `EditTaskModal.tsx`) |
| P2 | Automation run history | `FindAutomationRunsQueryDto` has no `ruleId` | Choosing a rule in the filter → 400 | Filter by rule client-side (`automations.ts`) |
| P2 | Post deliverables | `AttachPostAssetDto`: `fileId, assetType` only | A typed label → 400 | Label field removed (`PostAssetsPanel.tsx`, `postAssets.ts`) |
| P2 | Art Director | `TASK_ASSIGN_ROLES` includes `ART_DIRECTOR` | Could not change a task's approver in the UI | `tasks:approver` granted (`permissions.ts`) |
| P3 | Task title/description | `MaxLength(180)` / `MaxLength(3000)` | No client-side limit | `maxLength` on both inputs |
| P3 | Roles notice | — | A missing endpoint showed "Try again", which can never succeed | 404 is reported as unsupported, without a retry |

## Verified to match (no change needed)

- **Auth:** login, refresh (httpOnly cookie), logout, `/auth/me` as `{ user }`, forgot/reset
  password, accept invitation (`token, fullName?, password?`).
- **Multiple roles:** `roles: CompanyMembershipRole[]` on members; PATCH sends the full array;
  empty is blocked client-side (400 server-side); any held role wins; platform role separate.
  `ART_DIRECTOR` is a real backend role.
- **Enums:** lead source, status and lost reason; post status, platform and content type; task
  status, priority and types; campaign status and objective; automation trigger, action and run
  status; post asset type; platform role; membership role; attachment kind and entity;
  responsibility type; service-area keys; all 21 notification types — identical sets.
- **Task workflow:** create (types, custom type, draft, sequence 1–50 on POST parents, three
  attachment lists ≤ 20), status, submit-for-review, approve, request-changes (`note`),
  `publish-draft`, `DELETE` draft, `resolve-approver?taskTypes=`, `?taskType=` and `?drafts=true`.
- **Attachments:** `fileId | url | text` + `label`, on tasks, posts, campaigns, leads and brand profile.
- **Leads:** create, update, status with `lostReason` and `dealValue`, notes (`note`).
- **Reports:** overview `?month&year`, monthly create, share with `?rotate`, public token read.
- **Paging:** every paged list stays within its DTO's `@Max` (100; 200 for assignments).

## Frontend deliberately narrower than the backend

Kept as product policy, not defects: role editing on Members is admin-only (the API also lets an
Account Manager); the report list and brand-profile editing are Account Manager only (the API
lets any member); leads are hidden from the client portal (the API lets a Client Owner create
them). None of these widen access.

## Not verified

Anything behind sign-in on a running backend: there is no staging environment or test account.
`npm run e2e:live` (read-only) covers this once one exists — see `qa/README.md`.
