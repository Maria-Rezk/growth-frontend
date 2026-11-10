# Route verification matrix

Generated 2026-11-10T06:32:49.732Z by `npm run e2e:evidence` (Playwright, Chrome).

**Environment: demo mode** (local Vite server, in-memory sample data, no backend).
A "pass" here means the page rendered its heading, logged no console errors and did not
scroll sideways. It is not evidence of compatibility with the real API.

"Page" is the label the navigation shows. "Who reaches it" is how `src/App.tsx` guards the
route; the guards are cosmetic and the API enforces the real rule. The demo signs in as a
platform admin with every permission, so every row is rendered as staff: the client-side
redirects are covered by unit tests (`AgencyRoute.test.tsx`), not by this run.

| Route | Page | Who reaches it | Heading rendered | Desktop 1440 | Mobile 375 | Desktop load | Screenshots |
|---|---|---|---|---|---|---|---|
| `/my-work` | My work | Staff (a client is sent to Home) | My work | pass | pass | 1627 ms | [desktop](screenshots/my-work-desktop.png) · [mobile](screenshots/my-work-mobile.png) |
| `/dashboard` | Client overview | Staff (a client is sent to Home) | Solu1ions Demo Workspace | pass | pass | 1528 ms | [desktop](screenshots/dashboard-desktop.png) · [mobile](screenshots/dashboard-mobile.png) |
| `/brand-profile` | Brand profile | Staff and clients | Brand profile | pass | pass | 1581 ms | — |
| `/content-plans` | Content plans | Staff and clients | Content plans | pass | pass | 1602 ms | [desktop](screenshots/content-plans-desktop.png) · [mobile](screenshots/content-plans-mobile.png) |
| `/content-plans/plan-1` | Content plan detail | Staff and clients | June Growth Content Plan | pass | pass | 1640 ms | — |
| `/ai-studio` | AI studio | Staff (a client is sent to Home) | AI studio | pass | pass | 1590 ms | — |
| `/posts` | Content posts | Staff and clients | Content posts | pass | pass | 1560 ms | — |
| `/posts/post-1` | Post detail | Staff and clients | Agency Growth OS launch teaser | pass | pass | 1620 ms | — |
| `/campaigns` | Campaigns | Staff (a client is sent to Home) | Campaigns | pass | pass | 1603 ms | — |
| `/campaigns/campaign-1` | Campaign detail | Staff (a client is sent to Home) | Summer Laser Offer Campaign | pass | pass | 1647 ms | — |
| `/leads` | Leads | Staff (a client is sent to Home) | Leads | pass | pass | 1708 ms | [desktop](screenshots/leads-desktop.png) · [mobile](screenshots/leads-mobile.png) |
| `/leads/lead-1` | Lead detail | Staff (a client is sent to Home) | Nour Clinic | pass | pass | 1630 ms | — |
| `/tasks` | Tasks | Staff (a client is sent to Home) | Tasks | pass | pass | 1611 ms | [desktop](screenshots/tasks-desktop.png) · [mobile](screenshots/tasks-mobile.png) |
| `/tasks/task-1` | Task detail | Staff (a client is sent to Home) | Revise launch carousel CTA | pass | pass | 1785 ms | — |
| `/approvals` | Approval queue | Staff (a client is sent to Home) | Approval queue | pass | pass | 1658 ms | [desktop](screenshots/approvals-desktop.png) · [mobile](screenshots/approvals-mobile.png) |
| `/responsibilities` | Responsibility matrix | Staff (a client is sent to Home) | Responsibility matrix | pass | pass | 1653 ms | [desktop](screenshots/responsibilities-desktop.png) · [mobile](screenshots/responsibilities-mobile.png) |
| `/automations` | Automations | Staff (a client is sent to Home) | Automations | pass | pass | 2079 ms | [desktop](screenshots/automations-desktop.png) · [mobile](screenshots/automations-mobile.png) |
| `/reports` | Reports | Staff and clients | Reports | pass | pass | 1600 ms | [desktop](screenshots/reports-desktop.png) · [mobile](screenshots/reports-mobile.png) |
| `/members` | Members | Staff (a client is sent to Home) | Members | pass | pass | 1590 ms | [desktop](screenshots/members-desktop.png) · [mobile](screenshots/members-mobile.png) |
| `/notifications` | Notifications | Staff and clients | Notifications | pass | pass | 1608 ms | — |
| `/home` | Client home | Staff and clients | Solu1ions Demo Workspace — Home | pass | pass | 1535 ms | — |
| `/admin/dashboard` | Operations dashboard | Platform admins | Operations dashboard | pass | pass | 1659 ms | [desktop](screenshots/admin-dashboard-desktop.png) · [mobile](screenshots/admin-dashboard-mobile.png) |
| `/admin/activity` | Activity log | Platform admins | Activity log | pass | pass | 1742 ms | — |
| `/admin/employees` | Employees | Platform admins | Employees | pass | pass | 1552 ms | — |
| `/admin/clients` | Clients | Platform admins | Clients | pass | pass | 1711 ms | — |

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
