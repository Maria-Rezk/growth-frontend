# Growth Platform Frontend — Production UI/UX Foundation

React + Vite + TypeScript frontend for the Solu1ions Growth Platform / Agency Growth Operating System.

This version is prepared as a senior frontend/UI foundation: it is workflow-oriented, role-aware, brand-aligned, and ready for real backend integration hardening.

## Included

- React 18 + Vite 5 + TypeScript.
- Branded SaaS dashboard using Solu1ions dark blue, magenta, concrete/off-white and modern corporate direction.
- Protected routing and auth context.
- Company/workspace context and company switcher.
- Command-center dashboard.
- Content workflow board and sortable table.
- Leads pipeline board and sortable table.
- Task execution board and sortable table.
- Post detail approval workflow stepper.
- Reports, members, invitations and notifications pages.
- Merged reusable notification components in `src/components/notifications` and wired them into the Topbar dropdown and Notifications page.
- Compatibility UI files kept in `src/components/ui` such as `EmptyState`, `ErrorState`, `Spinner`, `Table`, `Pagination`, `FilterBar`, `Input`, `Select`, `icons`, `primitives` and `states`.
- Role-aware UI gates for actions.
- Central API route map in `src/config/apiRoutes.ts`.
- API service layer separated from UI.
- Robust response unwrapping for common NestJS response envelopes.
- Demo mode for UI review without backend.
- TanStack Query-backed async data layer.
- React Hook Form + Zod validation on auth, brand profile, post, lead and task forms.
- Toast feedback for important successful mutations.
- Client-side table pagination and sorting.
- Debounced search inputs.
- Accessible labels, error states, `aria-invalid` states, skip link, focus-visible styles and reduced-motion support.
- App error boundary to prevent full UI crashes.
- Stable npm registry configuration via `.npmrc`.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Default frontend URL:

```txt
http://localhost:5173
```

## Environment

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_DEMO_MODE=true
VITE_API_TIMEOUT_MS=25000
```

Use demo mode for visual review without backend:

```env
VITE_DEMO_MODE=true
```

Use real backend integration mode:

```env
VITE_DEMO_MODE=false
VITE_API_BASE_URL=http://localhost:3000/api
```

Restart Vite after changing `.env`.

## Commands

```bash
npm run dev
npm run build
npm run preview
```

`npm run build` runs TypeScript first, then Vite production build.

## Backend integration contract

Main expected API groups:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/accept-invitation`
- `GET /companies`
- `POST /companies`
- `GET /companies/:companyId/members`
- `GET|PUT /companies/:companyId/brand-profile`
- `GET|POST /companies/:companyId/content-plans`
- `GET|POST /companies/:companyId/posts`
- `GET|PATCH /companies/:companyId/posts/:postId`
- `POST /companies/:companyId/posts/:postId/submit-review`
- `POST /companies/:companyId/posts/:postId/approve`
- `POST /companies/:companyId/posts/:postId/request-changes`
- `POST /companies/:companyId/posts/:postId/reject`
- `POST /companies/:companyId/posts/:postId/publish`
- `GET|POST /companies/:companyId/posts/:postId/comments`
- `GET|POST /companies/:companyId/posts/:postId/assets`
- `POST /companies/:companyId/files/upload`
- `GET|POST /companies/:companyId/leads`
- `GET|PATCH /companies/:companyId/leads/:leadId`
- `PATCH /companies/:companyId/leads/:leadId/status`
- `GET|POST /companies/:companyId/leads/:leadId/notes`
- `GET /companies/:companyId/leads/:leadId/status-history`
- `GET|POST /companies/:companyId/tasks`
- `GET|PATCH /companies/:companyId/tasks/:taskId`
- `PATCH /companies/:companyId/tasks/:taskId/status`
- `GET|POST /companies/:companyId/tasks/:taskId/comments`
- `GET|POST /companies/:companyId/tasks/:taskId/attachments`
- `GET /companies/:companyId/reports/overview`
- `GET /companies/:companyId/reports`
- `POST /companies/:companyId/reports/monthly`
- `GET|POST /companies/:companyId/invitations`
- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/read-all`
- `PATCH /notifications/:notificationId/read`

If the backend endpoint names differ, update `src/config/apiRoutes.ts` once instead of editing every page.

If the backend response wrapper differs, update `src/lib/http.ts` `unwrap()` once instead of editing every service.

## Recommended final QA before launch

1. Set `VITE_DEMO_MODE=false`.
2. Log in with a real user.
3. Confirm `/auth/me` returns the user and memberships.
4. Confirm the company switcher loads companies.
5. Test create/update flows for brand profile, post, lead, task and invitation.
6. Test approval actions with different roles.
7. Test upload/attach assets and task files.
8. Test token expiration and 401 redirect behavior.
9. Test CORS from the deployed frontend domain.
10. Test mobile layouts for dashboard, boards, tables and modals.

## Windows npm note

If npm tries to use an internal or wrong registry, run:

```powershell
npm config set registry https://registry.npmjs.org/
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm cache clean --force
npm install --registry=https://registry.npmjs.org/
npm run dev
```

If Windows blocks deletion of `node_modules`, close VS Code/dev server or run:

```powershell
taskkill /F /IM node.exe
```
