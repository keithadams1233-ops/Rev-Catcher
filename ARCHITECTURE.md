# Architecture

Status: reflects Phase 1 (Project Foundation) and Phase 2 (Manager UI).
Sections describing engines that don't exist yet are marked "planned" — they
document the design those phases will implement against, not what's running
today.

## Manager data-access layer (Phase 2)

Every manager screen reads through `src/lib/data/manager.ts` — server-only
functions (`import "server-only"` enforces this at build time) that take the
caller's `organizationId`, sourced from their own profile server-side, and
filter on it explicitly on top of RLS. Each one does 2-3 plain queries and
zips the results in TypeScript rather than using PostgREST's embedded-resource
`select("*, locations(name)")` syntax — our hand-written `Database` type
(`src/lib/types/database.ts`) sets every table's `Relationships` to `[]`
since it's maintained by hand, not generated from a live schema, so
postgrest-js can't type-check an embedded select against it reliably. At
this data volume (tens of rows, not thousands) the extra round-trip is free;
switching to embedded selects (or regenerating real types from a live
project) is a fine optimization later, not a correctness requirement now.

The goal builder (`/manager/goals/new`) is the one place Phase 2 writes,
not just reads: launching a challenge (`src/app/manager/goals/new/actions.ts`)
inserts `challenges` → `challenge_tiers` → optionally `team_goals` →
`challenge_participants` (one per employee at the leak's location) →
`notifications`, then flips the source `revenue_leaks.status` to
`challenge_created` — all through the manager's own RLS-scoped session
(no service-role client involved; the existing "managers can write" RLS
policies from Phase 1 are what actually authorize each insert). This is
sequential inserts, not one Postgres transaction — a real `BEGIN`/`COMMIT`
would need a `plpgsql` RPC function, which is worth adding once Phase 7
formalizes the challenge engine, but isn't necessary for a single manager
launching a challenge through the UI today. Every financial number
(projected revenue/profit) is recomputed server-side from the leak row the
server just re-fetched, not trusted from the client payload.

## Tenant model

```
organizations
  └── locations
        └── employee_locations (many-to-many)
              └── profiles (employees, managers, admins, owners)
```

- Every tenant-scoped table carries `organization_id` (directly, or via a
  join to a table that does — see below). One organization must never be
  able to read or write another organization's rows.
- `profiles` extends `auth.users` 1:1 (`profiles.id = auth.users.id`) and
  adds `organization_id` + `role`. A new `auth.users` row automatically gets
  a `profiles` row via the `handle_new_user()` trigger
  (`supabase/migrations/0003_helper_functions.sql`), reading
  `organization_id` / `role` / `first_name` / `last_name` out of
  `raw_user_meta_data` (set by the server-side invite/seed flow via
  `admin.createUser({ user_metadata })`).
- `employee_locations` lets one employee work multiple locations
  (`primary_location` marks the default for aggregate reporting).
- Roles: `owner`, `admin`, `manager` see the Rev Catcher (manager) experience;
  `employee` sees Rev Rewards. `isManagerRole()` in
  `src/lib/auth/get-current-profile.ts` is the single source of truth for
  that split.

## Isolation: Row Level Security

Enforced in Postgres (`supabase/migrations/0004_rls_policies.sql`), not in
application code — the client is never trusted to supply a correct
`organization_id`. Three `security definer` helper functions
(`0003_helper_functions.sql`) make this practical:

- `current_org_id()` — the calling user's `organization_id`.
- `current_role()` — the calling user's `role`.
- `is_manager_or_above()` — `role in ('owner','admin','manager')`.

They're `security definer` specifically so they can query `profiles` from
inside a policy *on* `profiles` without recursive-RLS deadlocks.

Policy shape, by table category:

| Category | Example tables | Policy |
| --- | --- | --- |
| Direct org column | `locations`, `challenges`, `point_ledger` | `organization_id = current_org_id()` |
| Joined through parent | `challenge_tiers`, `team_goals`, `challenge_participants` | `EXISTS (... challenges c WHERE c.id = ... AND c.organization_id = current_org_id())` |
| Manager-only reads | `transactions`, `transaction_items`, `pos_imports`, `revenue_leaks`, `metric_snapshots` (org-wide) | additionally requires `is_manager_or_above()` — raw POS data and financial estimates aren't employee-facing |
| Employee-own reads | `point_ledger`, `xp_ledger`, `employee_mission_progress`, `reward_redemptions`, `notifications`, `metric_snapshots` (own row) | `employee_id = auth.uid()` / `user_id = auth.uid()`, in addition to the manager-org policy |
| Server-write-only | `point_ledger`, `xp_ledger`, `employee_levels`, `streaks`, `employee_badges`, `metric_snapshots`, `revenue_leaks` (insert), `transactions`/`transaction_items` (insert) | **no client insert/update policy at all** — only the service-role client (which bypasses RLS) can write these; see below |

The last row is deliberate, not an oversight: points, XP, levels, streaks,
badges, computed metrics, and detected leaks must only ever be produced by
trusted server logic (the ledger writer, the metric engine, the CSV import
pipeline), never by a client `insert`. That's also how the point/XP ledgers
stay idempotent (see below).

## Supabase clients

Three, in `src/lib/supabase/`:

- **`client.ts`** — browser client, anon key. For client components.
- **`server.ts`** →`createClient()` — server client, anon key + the caller's
  session cookie (via `@supabase/ssr`). Used in Server Components, route
  handlers, and Server Actions. Every query still runs through RLS as that
  user.
- **`server.ts`** → `createServiceRoleClient()` — service-role key, bypasses
  RLS entirely. Throws if called from `window` context. Reserved for
  trusted server-only pipelines (CSV import, metric engine, ledger writers)
  that land in later phases; every caller of it is responsible for its own
  authorization checks, since RLS won't do it for them.
- **`middleware.ts`** → `updateSession()` — refreshes the auth session
  cookie on every request (`src/middleware.ts`), so Server Components never
  see a stale/expired session.

The service-role key is never imported into anything that ships to the
client bundle. It's read once, server-side, from `SUPABASE_SERVICE_ROLE_KEY`.

## Database schema

Full DDL: `supabase/migrations/0001_initial_schema.sql`. Grouped by concern:

- **Tenant tree:** `organizations`, `locations`, `profiles`, `employee_locations`.
- **POS data:** `pos_imports`, `transactions`, `transaction_items`. This is
  the normalized internal format every POS source (CSV today, Toast/Square/
  Clover later) is expected to produce — see "Future POS adapter" below.
- **Metrics:** `metric_definitions` (the six detectors — beverage/add-on/
  dessert attachment, premium upgrade rate, average ticket, loyalty
  enrollment), `metric_snapshots` (computed values per location/employee/
  period).
- **Detection & challenges:** `revenue_leaks`, `challenges`, `challenge_tiers`,
  `challenge_participants`, `team_goals`.
- **Missions:** `daily_missions`, `employee_mission_progress`.
- **Gamification:** `point_ledger`, `xp_ledger`, `employee_levels`, `streaks`,
  `badges`, `employee_badges`.
- **Rewards:** `reward_catalog`, `reward_redemptions`.
- **Notifications:** `notifications`.

`supabase/migrations/0002_reference_data.sql` seeds the platform-level
reference rows that aren't tenant-specific: the 6 `metric_definitions`, the
8 `badges`, and the 4 global `reward_catalog` tiers ($5/500pts, $10/1,000pts,
$25/2,500pts, $50/5,000pts).

TypeScript types for all of this live in `src/lib/types/database.ts`,
hand-written to mirror the migrations 1:1. Regenerate from a live project
once one exists:

```bash
npx supabase gen types typescript --project-id <id> > src/lib/types/database.ts
```

## The points ledger is immutable (planned, Phase 8)

`point_ledger` and `xp_ledger` are append-only. An employee's point balance
is **always** `SUM(points)` over their ledger rows — there is intentionally
no mutable `balance` column anywhere to drift out of sync. Every row is a
receipt: `transaction_type` (`earn` / `redeem` / `adjustment` / `reversal`),
`source_type` + `source_id` (what earned it — a mission, a challenge tier, a
manual adjustment), and `dollar_value` at the org's `default_point_value`
rate (100 points = $1 by default).

Idempotency is enforced in the schema, not just in application logic: a
partial unique index —

```sql
create unique index point_ledger_idempotency_idx
  on point_ledger(employee_id, source_type, source_id)
  where source_id is not null;
```

— makes it a constraint violation, not just a bug, to award points for the
same `(employee, source_type, source_id)` twice. The same pattern exists on
`xp_ledger`. This is what makes "points are automatically added exactly
once" (spec success criteria) an invariant the database enforces rather than
something the application has to get right on every code path.

## Metric engine (planned, Phase 4)

Deterministic, not AI — every detector is a ratio computed from
`transactions` / `transaction_items`:

```
attachment_rate = eligible_transactions_with_target_item / eligible_transactions
```

computed at employee, location, and organization level into
`metric_snapshots`. Exclusions (voids, refunds, outlier tickets) are applied
at the SQL/query level before the ratio, not after — see spec §16
(anti-gaming rules) and §7 (detector definitions).

## Revenue leak detection (planned, Phase 6)

```
gap = benchmark_value - current_value
estimated_incremental_revenue = eligible_transactions_per_month × gap × avg_attached_item_price
estimated_contribution_profit = estimated_incremental_revenue × category_margin
```

Benchmark source is chosen by data availability: top-performing-quartile of
comparable locations when there's enough of them, else organization average
(spec §7). `confidence_score` reflects sample size and benchmark quality —
surfaced to managers (via `ConfidenceBadge`) as High/Medium/Low, never as a
guarantee. **Not implemented yet** — the `revenue_leaks` rows the Leaks
screens read today are hand-authored demo data (`scripts/seed.ts`)
reproducing the spec's example numbers exactly ($47,820 / $28,340 / 17
leaks), not something this formula computed. The Leaks/leak-detail UI is
real and phase-complete; the arithmetic that's supposed to populate the
table is what Phase 6 adds.

## Challenge engine

Schema and UI are real as of Phase 2; the *automated* pieces (metric-driven
progress updates, tier/ranking recalculation as new POS data lands,
completion + ROI measurement) are still Phase 7/9. What exists now:

`challenges` → `challenge_tiers` (points per threshold) → `challenge_participants`
(one row per employee, baseline/current/best value + points earned) →
optional `team_goals` (location-wide threshold, flat bonus to everyone on
completion if hit). The goal builder
(`src/app/manager/goals/new/actions.ts`) launches a challenge for real:
creates `challenge_participants` for every employee at the location
(baseline = the leak's `current_value` — there's no per-employee metric
snapshot to seed a real individual baseline from until Phase 4 exists),
fires a `new_challenge` notification per participant, and flips the source
leak to `challenge_created`, all sequentially through the manager's own
RLS-scoped session (see "Manager data-access layer" above for why this
isn't one DB transaction yet). Employees never see a challenge without also
seeing their baseline.

Progress *tracking* — a participant's `current_value` moving as real
transactions come in, `rank` being recalculated, `team_goals.current_value`
updating — has no automated writer yet; those columns only get sensible
values today from the hand-seeded demo challenge ("Beverage Boost"). That
automation is Phase 7's job, once Phase 4's metric engine exists to feed it.

## Future POS adapter design (planned)

CSV import (Phase 5) is designed as the first implementation of a
`PosAdapter` interface, not a special case:

```ts
interface PosAdapter {
  getLocations(): Promise<NormalizedLocation[]>;
  getEmployees(): Promise<NormalizedEmployee[]>;
  getTransactions(startDate: Date, endDate: Date): Promise<NormalizedTransaction[]>;
  getCatalog(): Promise<NormalizedItem[]>;
  normalizeTransaction(raw: unknown): NormalizedTransaction;
}
```

`CsvAdapter` maps uploaded columns → this shape once, via a saved per-org
mapping. Future `ToastAdapter` / `SquareAdapter` / `CloverAdapter` implement
the same interface against their own APIs and feed the same
`transactions` / `transaction_items` tables — the metric engine, leak
detector, and challenge engine never need to know which adapter produced a
row.

## Known trade-offs

- **Next.js 15.5.x, not 14.x.** `create-next-app` defaults to Next 16 in
  this environment; 16's API surface isn't reliably in this assistant's
  training data, so 14 was the safer initial choice — until `npm audit`
  showed the 14.x line no longer receives backports for several DoS/SSRF
  advisories that *are* patched in 15.5.x. 15's App Router API (async
  `cookies()`/`headers()`/`searchParams`) is the same shape already used
  throughout this codebase, so the switch cost nothing. One residual
  `npm audit` finding remains: a `postcss` version bundled *inside* Next's
  own internal build tooling (not the top-level `postcss` this project's
  Tailwind pipeline uses, which is current) — fixed only in Next 16.
  Revisit once 16 has had time to stabilize and its docs are reliably
  covered.
- **Reward redemption has no client insert policy yet.** Spending points
  needs a balance check before the insert (never let a client insert a
  redemption for more points than the ledger sums to); that's a
  server-side RPC, built alongside the Rewards screen in Phase 8, not a
  raw `insert` RLS policy.
- **`@supabase/ssr` must stay reasonably current.** Pinning it to an older
  release (`^0.5.x`) against a freshly-installed, much newer
  `@supabase/supabase-js` broke typed queries outright — every
  `.select()` through `createClient()`/`createServerClient()` resolved to
  `never`, because `@supabase/ssr`'s bundled `GenericSchema` type (pulled
  from `@supabase/supabase-js/dist/module/lib/types`) no longer matched
  the installed `postgrest-js`'s actual shape (`Relationships` field,
  `Views`/`Functions` on the schema object). Bumping to `^0.12.0` fixed it
  immediately — if this resurfaces after a `supabase-js` bump, check
  `@supabase/ssr`'s version first before suspecting the hand-written
  `Database` type.
- **Manager screens do 2-3 sequential queries instead of one PostgREST
  embedded select.** See "Manager data-access layer" above — same root
  cause category (our hand-written `Database` type's empty
  `Relationships` arrays don't give postgrest-js enough to type-check an
  embed), worked around by not using embeds rather than by further
  fighting the types.
