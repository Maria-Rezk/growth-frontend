# Route verification matrix

Generated 2026-10-29T11:52:18.253Z by `npm run e2e:evidence` (Playwright, Chrome).

**Environment: demo mode** (local Vite server, in-memory sample data, no backend).
A "pass" here means the page rendered its heading, logged no console errors and did not
scroll sideways. It is not evidence of compatibility with the real API.

"Page" is the label the navigation shows. "Who reaches it" is how `src/App.tsx` guards the
route; the guards are cosmetic and the API enforces the real rule. The demo signs in as a
platform admin with every permission, so every row is rendered as staff: the client-side
redirects are covered by unit tests (`AgencyRoute.test.tsx`), not by this run.

| Route | Page | Who reaches it | Heading rendered | Desktop 1440 | Mobile 375 | Desktop load | Screenshots |
|---|---|---|---|---|---|---|---|
| `/my-work` | My work | Staff (a client is sent to Home) | My work | pass | pass | 2900 ms | [desktop](screenshots/my-work-desktop.png) · [mobile](screenshots/my-work-mobile.png) |
| `/dashboard` | Client overview | Staff (a client is sent to Home) | Solu1ions Demo Workspace | pass | pass | 2474 ms | [desktop](screenshots/dashboard-desktop.png) · [mobile](screenshots/dashboard-mobile.png) |
| `/brand-profile` | Brand profile | Staff and clients | Brand profile | pass | pass | 2643 ms | — |
| `/content-plans` | Content plans | Staff and clients | Content plans | pass | pass | 2588 ms | [desktop](screenshots/content-plans-desktop.png) · [mobile](screenshots/content-plans-mobile.png) |
| `/content-plans/plan-1` | Content plan detail | Staff and clients | June Growth Content Plan | pass | pass | 2409 ms | — |
| `/ai-studio` | AI studio | Staff (a client is sent to Home) | AI studio | pass | pass | 2800 ms | — |
| `/posts` | Content posts | Staff and clients | Content posts | pass | pass | 2335 ms | — |
| `/posts/post-1` | Post detail | Staff and clients | Agency Growth OS launch teaser | pass | pass | 2725 ms | — |
| `/campaigns` | Campaigns | Staff (a client is sent to Home) | Campaigns | pass | pass | 2623 ms | — |
| `/campaigns/campaign-1` | Campaign detail | Staff (a client is sent to Home) | Summer Laser Offer Campaign | pass | pass | 2588 ms | — |
| `/leads` | Leads | Staff (a client is sent to Home) | Leads | pass | pass | 2464 ms | [desktop](screenshots/leads-desktop.png) · [mobile](screenshots/leads-mobile.png) |
| `/leads/lead-1` | Lead detail | Staff (a client is sent to Home) | Nour Clinic | pass | pass | 2740 ms | — |
| `/tasks` | Tasks | Staff (a client is sent to Home) | Tasks | pass | pass | 2576 ms | [desktop](screenshots/tasks-desktop.png) · [mobile](screenshots/tasks-mobile.png) |
| `/tasks/task-1` | Task detail | Staff (a client is sent to Home) | Revise launch carousel CTA | pass | pass | 3014 ms | — |
| `/approvals` | Approval queue | Staff (a client is sent to Home) | Approval queue | pass | pass | 2517 ms | [desktop](screenshots/approvals-desktop.png) · [mobile](screenshots/approvals-mobile.png) |
| `/responsibilities` | Responsibility matrix | Staff (a client is sent to Home) | Responsibility matrix | pass | pass | 2615 ms | [desktop](screenshots/responsibilities-desktop.png) · [mobile](screenshots/responsibilities-mobile.png) |
| `/automations` | Automations | Staff (a client is sent to Home) | Automations | pass | pass | 2552 ms | [desktop](screenshots/automations-desktop.png) · [mobile](screenshots/automations-mobile.png) |
| `/reports` | Reports | Staff and clients | Reports | pass | pass | 2571 ms | [desktop](screenshots/reports-desktop.png) · [mobile](screenshots/reports-mobile.png) |
| `/members` | Members | Staff (a client is sent to Home) | Members | pass | pass | 2562 ms | [desktop](screenshots/members-desktop.png) · [mobile](screenshots/members-mobile.png) |
| `/notifications` | Notifications | Staff and clients | Notifications | pass | pass | 2789 ms | — |
| `/home` | Client home | Staff and clients | Solu1ions Demo Workspace — Home | pass | pass | 2606 ms | — |
| `/admin/dashboard` | Operations dashboard | Platform admins | Operations dashboard | pass | pass | 2605 ms | [desktop](screenshots/admin-dashboard-desktop.png) · [mobile](screenshots/admin-dashboard-mobile.png) |
| `/admin/activity` | Activity log | Platform admins | Activity log | pass | pass | 3277 ms | — |
| `/admin/employees` | Employees | Platform admins | Employees | pass | pass | 2433 ms | — |
| `/admin/clients` | Clients | Platform admins | Clients | pass | pass | 2626 ms | — |

## Where people land

| Who | `/` sends them to |
|---|---|
| Staff with a client | `/my-work` (My work) |
| A client-side member | `/home` (Home) |
| A platform admin with no client | `/admin/dashboard` (Operations dashboard) |
| Anyone else with no client | An explanation in place, no redirect |
| Signed out | `/login`, then back to the full address they asked for |

Public, without signing in: `/login`, `/forgot-password`, `/accept-invitation`, and shared report links.
Any other address shows "Page not found" inside the app, with the typed address kept.
