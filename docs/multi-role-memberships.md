# Multi-role memberships

**Status:** blocked on backend. No frontend code has been written for this yet.

One person needs to hold several roles on the same client — Designer *and* Copywriter for Shahba
Bank. The frontend cannot do this alone: a membership row holds a single `role`, and a person can
only have one membership per client, so the assign form hides any client they already belong to.

> The constraint and endpoint behaviour below are inferred from the client code and the live API's
> responses. No backend source or schema was available — confirm the real table and column names
> before writing a migration.

## Where it stands today

```
Membership {
  id          uuid
  companyId   uuid
  userId      uuid
  role        ACCOUNT_MANAGER | COPYWRITER | DESIGNER | SOCIAL_MEDIA_MANAGER
              | CLIENT_OWNER | CLIENT_REVIEWER | SALES_AGENT
  status      ACTIVE | SUSPENDED
}
```

From `src/types/domain.ts`. Two comments in the frontend record the constraint —
`src/pages/EmployeesPage.tsx` and `src/components/admin/ClientDetailPanel.tsx`, both filtering
against it rather than letting the user discover it as an error.

## The change

Widen the uniqueness rule by one column. The row shape does not change, so there is no data
migration and every existing membership stays valid.

```diff
- UNIQUE (user_id, company_id)
+ UNIQUE (user_id, company_id, role)
```

A person can then hold as many roles on a client as there are roles, and re-adding a role they
already have still fails — which is the behaviour the UI wants to rely on.

## What that means per endpoint

| Endpoint | Change |
| --- | --- |
| `POST /companies/:companyId/members` | Body unchanged (`{ userId, role }`). Becomes callable more than once for the same person on the same client, as long as the role differs. Keep returning a conflict when the exact `(user, client, role)` already exists. |
| `GET /companies/:companyId/members` | Now returns more than one row per person. No shape change, but consumers must stop assuming `userId` is unique in the list. |
| `DELETE /companies/:companyId/members/:membershipId` | Already scoped to one membership, so it now removes *one role* rather than removing the person from the client. Worth deciding whether a "remove from client entirely" route is also wanted. |
| `GET /users` | No change needed. The `clients[]` array already carries one entry per membership with its own `membershipId` and `role`; it will simply contain two entries naming the same company. |

## Decide before building: partial saves

If the UI assigns three roles as three sequential POSTs and the second is rejected, the first has
already been written. The person ends up with a role nobody chose and there is nothing sensible to
roll back to.

Cheapest fix: let the endpoint also accept `{ userId, roles: [...] }` and create them in one
transaction, so the whole assignment either lands or doesn't. If the request shape should stay as
it is, the UI will do sequential calls and report exactly which roles saved — workable, just
noisier for the person using it.

**This is the one open question. Everything else follows from it.**

## What it changes on the frontend

Four places assume one membership per person per client.

- **`src/context/CompanyContext.tsx` — role checks pick one row arbitrarily.** `currentMembership`
  is a `.find()` over the memberships for the active client, and `hasRole()` tests only that one. A
  Designer + Copywriter would fail a Copywriter check depending on row order. Both need to consider
  every active membership for the client. *This is a latent bug the change would expose, not one the
  change creates.*
- **`src/pages/EmployeesPage.tsx` and `src/components/admin/ClientDetailPanel.tsx` — the "already
  assigned" filters are too broad.** Both hide any client the person belongs to, and any person
  already on the client. They need to exclude `(client, role)` pairs instead, so someone can be
  offered the roles they do not yet hold.
- **`src/pages/MembersPage.tsx` — people will appear more than once.** One row per membership means
  a duplicate-looking table; rows should group by person with their roles listed together.
- **`src/pages/EmployeesPage.tsx` Clients column — already fine.** The badges render one per entry
  in `clients[]`, so a second role shows up on its own: "Shahba Bank · Copywriter" beside
  "Shahba Bank · Designer".

## Then, on the frontend

- **Role on this client** becomes a multi-select — checkboxes rather than a dropdown, since the
  choices are few and picking several from a `<select>` is awkward.
- **Assign** stays one button and one confirmation, whether it saves one role or four.
- **The members table** shows one row per person carrying all their roles, each removable on its own.
- **Nothing ships half-working.** The current single-role picker keeps working exactly as it does
  now until the API is ready.
