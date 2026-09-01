# Architecture

Status: reflects Phase 1 (Project Foundation), Phase 2 (Manager UI),
Phase 3 (Employee UI), Phase 4 (Real Metric Engine), Phase 5 (CSV
Import), Phase 6 (Revenue Leak Engine), and Phase 7 (Challenge Engine).
Sections describing engines that don't exist yet are marked "planned" —
they document the design those phases will implement against, not what's
running today.

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
- **CSV import config** (`0005_pos_column_mappings.sql`, Phase 5):
  `pos_column_mappings` — one reusable column mapping per org (spec §19),
  the one table added after the original schema.

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

## The points ledger is immutable

`point_ledger` and `xp_ledger` are append-only. An employee's point balance
is **always** `SUM(points)` over their ledger rows — `getPointsBalance()`
(`src/lib/data/employee.ts`) computes it live on every read; there is
intentionally no mutable `balance` column anywhere to drift out of sync.
Every row is a receipt: `transaction_type` (`earn` / `redeem` /
`adjustment` / `reversal`), `source_type` + `source_id` (what earned it — a
mission, a challenge tier, a manual adjustment), and `dollar_value` at the
org's `default_point_value` rate (100 points = $1 by default).

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

**`employee_levels` and `streaks` are maintained snapshots, not raw
ledgers.** The spec's own schema (§5) defines them as separate small tables
(`current_level`/`current_xp`/`lifetime_xp`; `current_streak`/
`longest_streak`) rather than making the UI re-sum `xp_ledger` on every
page load — a standard event-log-plus-projection pattern. The invariant
that keeps this honest: `employee_levels.lifetime_xp` must always equal
`SUM(xp_ledger.xp)` for that employee, maintained by whatever server code
writes XP (right now, `scripts/seed.ts`'s `ensureXpBalance`; Phase 8's
mission/challenge-completion triggers later) — never edited independently.
Levels themselves use a deterministic formula
(`src/lib/gamification/levels.ts`, spec §15: `xpForLevel(level) = 500 +
level × 100`), shared by the seed script and the employee UI so they can't
compute "XP to next level" differently.

**Reward redemption is a real, validated write** (`src/app/employee/rewards/actions.ts`),
resolving the gap flagged in Phase 1/2's trade-offs: `reward_redemptions`
and `point_ledger` still have no client insert RLS policy (spending points
needs a balance check *before* the insert, which RLS alone can't express),
so `redeemReward()` authenticates the caller with their own session first,
then uses the service-role client to read their real ledger sum, verify
they can afford it, and insert both the redemption and the offsetting
`point_ledger` debit — doing its own authorization exactly as CLAUDE.md
rule #3 requires of service-role code. The debit's `source_id` is the
redemption row itself, so the same partial unique index that protects
`earn` rows also makes a double-charge impossible if the action ever ran
twice for one redemption.

**What's still Phase 8, not Phase 3:** nothing in the app yet writes
`point_ledger`/`xp_ledger`/mission-progress rows from a *live* event
(completing a mission, crossing a challenge tier, a streak advancing a
day) — those all come from hand-seeded demo data today. Phase 8 is what
wires real POS-driven progress into these tables automatically.

## Metric engine

Deterministic, not AI (spec §7) — `src/lib/metrics/` is a set of pure,
unit-tested TypeScript functions, not SQL, computing all five detectors:

```
attachment_rate = eligible_transactions_with_target_item / eligible_transactions   (beverage/add-on/dessert/premium-upgrade)
average_ticket   = mean(clean, non-outlier transaction totals)
```

- **`types.ts`** — `EngineTransaction`/`EngineTransactionItem`, decoupled
  from the Supabase `Database` row shape on purpose: the engine takes plain
  data, so it's testable without a database and so a future POS adapter
  (Toast/Square/Clover) only has to normalize into this shape, same as the
  CSV importer will.
- **`eligibility.ts`** — the anti-gaming rules (spec §16) as their own
  tested functions: `isCleanTransaction`/`isCleanItem` reject anything
  touched by a void or *any* refund (even partial — never a reduced-value
  count), and `excludeOutliers` IQR-fences average-ticket inputs (only once
  there's ≥8 data points; below that, "outlier" is just noise).
- **`category-rules.ts`** — default eligible/target category + modifier
  classification per detector. The spec asks for these to be
  manager-configurable (Detector 2: "Manager must be able to define which
  categories/items count as add-ons") — deliberately **still not**
  persisted; every calculator takes the rule as a parameter rather than
  hardcoding it, so a per-org override is a data-source change, not an
  engine rewrite, whenever it's built. Phase 5 added the natural place for
  it to live (the CSV column-mapping flow, since that's where a manager's
  own category taxonomy first enters the system) without actually adding
  the override itself — `transaction_items.category` is whatever string
  the CSV's mapped category column contained, matched against these
  defaults, same as before.
- **`attachment.ts`** / **`average-ticket.ts`** — the two actual formulas.
  Four of the five detectors (beverage/dessert/add-on/premium-upgrade) are
  the *same* attachment-rate formula with a different `AttachmentRule`;
  average ticket is its own calculation.
- **`aggregate.ts`** / **`index.ts`** — `computeMetric(metricCode, txns)`
  dispatches to the right detector; `computeMetricByEmployee` /
  `computeMetricByLocation` / `computeMetricForOrganization` are the
  employee/location/org-level rollups spec §7 asks for, built by grouping
  transactions before calling the same detector — the detector itself
  never knows what grain it's running at.
- **`from-db.ts`** — the one place that maps real `transactions`/
  `transaction_items` rows into `EngineTransaction[]`. Pure reshaping, no
  Supabase client.
- **`recalculate.ts`** (Phase 5) — the one piece of this module that
  isn't pure: `recalculateMetricSnapshots(organizationId)` pulls every
  transaction/item for the org via the service-role client, runs all five
  detectors at every location and location+employee grain it finds, and
  inserts a fresh batch of `metric_snapshots` rows. Called once at the end
  of a successful CSV import (`src/app/manager/settings/data-sources/actions.ts`)
  — see "CSV import" below for why recalculation runs over *all* of an
  org's transactions rather than just the newly-imported batch.

Every `MetricResult` carries its `denominator` (eligible transaction
count) alongside `value` — that's what a future caller applies the
"minimum eligible transactions before ranking anyone" rule (spec §16)
against. The engine computes it; a safe minimum for *ranking* someone is
still Phase 7's job (see "Revenue leak detection" below for the minimum
this engine's own output is now gated on for *leak reporting*, which
Phase 6 does implement).

**Real end-to-end as of Phase 6**: uploading a CSV writes
`transactions`/`transaction_items`, this engine runs over them into
`metric_snapshots`, and the revenue leak engine (below) reads those
snapshots into real `revenue_leaks` rows — see `npm test` for the
calculation logic. What's still missing is a screen that reads
`metric_snapshots` directly (a location's current-vs-benchmark trend
line, say) — the Leaks screens read `revenue_leaks`, which is the
computed *result*, not the raw snapshots themselves.

## CSV import

Spec §19's flow — upload → column mapping → validation → normalization →
dedupe by `external_transaction_id` → triggers metric recalculation —
implemented as the first (and for this MVP, only) `PosAdapter` (see "Future
POS adapter design" below). `src/lib/csv-import/` is deliberately
environment-agnostic, same reasoning as the metric engine: no Supabase
client, no Next.js, so the exact same parse → map → validate → group
functions run twice — once client-side in the upload wizard for the live
preview, and again server-side in the Server Action as the *authoritative*
check. The client's validation is a UX convenience; nothing about it is
trusted.

**A CSV row is one line item, not one transaction.** A real POS export
lists `item_name`/`category`/`quantity`/`price` per row, with
`transaction_id` as the only thing tying several rows into one order —
matching the spec's own column list (§19). `price` is treated as that
row's line total (not a per-unit price); `group-transactions.ts` derives
everything the `transactions` table needs but the CSV never states
directly: `subtotal` (sum of line totals), `total` (subtotal − discount,
no tax column in this MVP), and — the one anti-gaming-relevant judgment
call — `voided`/`refund_amount`. Void/refund are per-item in the CSV; a
transaction is only marked `voided` if *every* item in it was voided (a
single voided item off an otherwise-normal order is a partial void,
staying at the item level — `transaction_items.voided` — so it still
excludes just that item from attachment detection, not the whole order).
`refund_amount` sums the line totals of whatever items were marked
refunded.

**Column mapping is per-org and reusable** (`pos_column_mappings`, added
in `0005_pos_column_mappings.sql` — a table the original schema didn't
have; new tables get a migration + RLS + TS type same as any other, per
CLAUDE.md's convention). `guess-mapping.ts` proposes a first mapping from
the file's own header names (exact match first, then substring, so a
header containing another field's keyword doesn't steal it from a more
precise match) before falling back to whatever the org saved last time;
the manager reviews and can override before importing.

**Location and employee resolution happens server-side, against real
rows** — a CSV's location column is matched by name (case-insensitive)
against the org's actual `locations`; an unresolvable location rejects
the row with a specific error rather than silently dropping or
auto-creating one (setting up locations is expected to happen before a
pilot's first import, not implicitly via CSV). An employee identifier is
matched by email first, then by "first last" name; if neither matches,
the transaction still imports with `employee_id = null` rather than being
rejected — spec §10 (Pilot Hardening) explicitly names "missing employee
IDs" as an expected real-world case, and there's no reason to lose an
otherwise-valid transaction over it.

**Dedup is a pre-check, not a caught constraint violation.** The unique
index from Phase 1 (`transactions(organization_id, external_transaction_id)`)
is still there as a backstop, but the import action queries which
candidate IDs already exist and skips them before inserting, so it can
report an honest "N duplicates skipped" count rather than surfacing a
batch-insert failure. Every write (`transactions`, `transaction_items`,
`pos_imports`, `pos_column_mappings`, and the metric engine's
`metric_snapshots`) goes through the service-role client — none of these
tables have a client insert policy, by the same design as everything else
server-written in this app (CLAUDE.md rule #3); the Server Action is
responsible for its own authorization (manager role, `organization_id`
sourced from the caller's own profile, never from the request payload).

**Recalculation runs over the organization's entire transaction history,
not just the newly-imported rows** — an attachment rate or average ticket
is a rate over a period, not a per-batch number, so recomputing it from
only the latest upload would silently discard everything imported before
it. At pilot scale (thousands of transactions, not millions) re-scanning
everything on every import is cheap enough that a smarter incremental
approach isn't worth the complexity yet. Metric recalculation is
immediately followed by revenue leak detection and then challenge progress
updates (spec §19 steps 8-9 — see "Revenue leak detection" and "Challenge
engine" below), so a successful import can turn directly into updated
`revenue_leaks` and `challenge_participants`/`team_goals` rows, tier
points awarded, and challenges completed, without any extra manager
action. That closes out every step of spec §19's CSV import list.

**Pilot-scale constraint, stated rather than hidden:** the importer caps
at 5,000 rows per upload (`MAX_ROWS` in the Server Action) and Next's
Server Action body limit is raised to 8mb (`next.config.mjs`) to
accommodate it — a deliberate MVP boundary for "fastest path to a working
pilot," not an oversight. A larger export needs to be split; there's no
chunked-upload path yet.

## Revenue leak detection

Spec §7-9, `src/lib/revenue-leaks/` — pure functions (same discipline as
the metric engine: no AI, unit-tested, deterministic), plus one impure
job (`detect.ts`) that reads `metric_snapshots` and writes `revenue_leaks`.

```
gap = benchmark_value - current_value
estimated_incremental_revenue = eligible_transactions_per_month × gap × avg_attached_item_price
estimated_contribution_profit = estimated_incremental_revenue × category_margin
```

- **`benchmark.ts`** — spec §7's two-tier MVP default: top-performing
  quartile (`≥4` comparable locations, 75th percentile via the same
  `percentile()` the metric engine's outlier fencing uses —
  `src/lib/stats.ts`) or organization average (2-3 locations). Returns
  `null` — no leak possible — with fewer than 2 locations reporting that
  metric; there's no third tier for spec §7's "historical location
  baseline" option yet.
- **`contribution-margins.ts`** — default per-metric margin assumptions,
  matching what `scripts/seed.ts` used for the hand-authored demo leaks
  exactly (beverage 70%, dessert 68%, add-on 65%, premium-upgrade 60%,
  average ticket 55%) so real detection and the seeded numbers agree on
  what a category's margin means. Manager-configurable per spec §8 —
  **not persisted**, same deferral as `category-rules.ts` (Phase 4):
  every function takes a margin as a parameter, defaulting to this table.
- **`opportunity.ts`** — the formula above, spot-checked against the
  spec's own §8 worked example as a literal test case (10,000 eligible
  transactions, 28%→36%, $3.50 avg beverage sale → exactly $2,800
  revenue / $1,960 profit at a 70% margin). `average_ticket` is already a
  dollar metric, so its gap *is* the per-transaction opportunity — the
  `avg_attached_item_price` term is dropped for that one metric rather
  than double-counted. `extrapolateEligiblePerMonth` scales a snapshot's
  actual period (whatever data exists) to the spec's monthly figure.
- **`confidence.ts`** — a 0-1 score averaging two things: sample size
  (the snapshot's `denominator`, capped at `FULL_CONFIDENCE_SAMPLE_SIZE`
  = 100) and benchmark quality (how many locations fed it). Bucketed into
  High/Medium/Low for display by `confidenceLabel()`
  (`src/lib/format.ts`) — never a guarantee, per spec §5/§25.
- **`detect.ts`** (server-only) — reads each location's *latest*
  location-level `metric_snapshot` per metric (employee-level snapshots
  aren't benchmarked against each other; only locations are "comparable"
  per spec §7), computes a benchmark across all locations reporting that
  metric, and for each location below it with ≥3 eligible transactions
  (`MIN_DENOMINATOR_TO_REPORT` — a sample thinner than that isn't worth
  reporting at all, confidence score or not) resolves an average
  attached-item price from that location's own clean `transaction_items`
  and computes the opportunity. **This average-price lookup is a
  simplification**: it filters `transaction_items.voided`/`.refunded`
  directly rather than also checking the parent transaction's void/refund
  status the way the metric engine's `isCleanTransaction` does — a
  reasonable approximation for an *estimate* input, not the core rate
  calculation itself (which Phase 4's tested engine still owns).
  `revenue_leaks` is one row per (organization, location, metric) —
  **updated in place** across detection runs, not appended, so a leak's
  status (`open` → `challenge_created` → `dismissed`/`resolved`) survives
  a re-run: a leak already acted on is never overwritten with fresh
  numbers, and an `open` leak whose location catches up to benchmark
  auto-resolves instead of sitting there with a stale zero gap.

**Wired to two triggers**: automatically at the end of a successful CSV
import, right after metric recalculation (spec §19 step 8 —
`src/app/manager/settings/data-sources/actions.ts`), and manually via a
"Detect Leaks" button on `/manager/leaks`
(`src/app/manager/leaks/actions.ts`) for re-running without a new upload.

**What this means for the demo data**: the 17 hand-authored leaks from
`scripts/seed.ts` (open, not backed by real transactions) and real
detection now coexist by design, not by accident — if a manager uploads
real POS data for a location/metric that already has a seeded `open`
leak, detection overwrites it with real computed numbers; the Store #37
beverage-attachment leak that already became the "Beverage Boost"
challenge (`status = challenge_created`) is left untouched either way,
same as any other leak a manager has already acted on.

## Challenge engine

Schema and UI were real as of Phase 2 (creation, tiers, team goals,
baseline, launch); Phase 7 adds the automated piece that needed the
metric engine (Phase 4) to exist first — progress updates, rankings, and
completion.

`challenges` → `challenge_tiers` (points per threshold) → `challenge_participants`
(one row per employee, baseline/current/best value + points earned) →
optional `team_goals` (location-wide threshold, flat bonus to everyone on
completion if hit). The goal builder
(`src/app/manager/goals/new/actions.ts`) launches a challenge for real:
creates `challenge_participants` for every employee at the location, fires
a `new_challenge` notification per participant, and flips the source leak
to `challenge_created`, all sequentially through the manager's own
RLS-scoped session (see "Manager data-access layer" above for why this
isn't one DB transaction yet). **Baseline is now a real per-employee
lookup** (Phase 7): each participant's `baseline_value` comes from their
own latest `metric_snapshot` at the challenge's location/metric if one
exists, falling back to the leak's location-level `current_value` only for
an employee with no individual data yet (brand new, or before any CSV
import) — the simplification Phase 2 flagged as deferred until Phase 4
existed to produce that snapshot.

**Progress updates, rankings, and completion** (`src/lib/challenges/`):

- **`progress.ts`** — pure functions, same discipline as every other
  engine in this app. `computeParticipantUpdate` tracks tiers against
  `bestValue` (peak-ever, not the latest reading) so a bad reading after a
  tier is earned never claws points back — matches
  `challenge_participants.best_value`'s evident purpose in the schema.
  `computeRankings` is a plain descending sort (no tie-splitting — spec
  doesn't call for competition-style 1-1-3 ranking). `computeTeamGoalUpdate`
  flags completion only on the crossing turn, never re-firing.
  `isChallengeExpired` is a plain `today > end_date` string comparison
  (both already `YYYY-MM-DD`) — no `Date`-object timezone footguns.
- **`update-progress.ts`** (server-only) — for every `active` challenge,
  pulls each participant's own latest employee-level `metric_snapshot`
  (location + employee + metric all matching the challenge) and applies
  the update; a participant with no new snapshot yet is left untouched
  rather than overwritten with a stale re-read. Newly crossed tiers award
  `point_ledger` rows through the same idempotent
  `source_type`+`source_id` pattern used everywhere else in this app (the
  partial unique index is the backstop; an existence check is what makes
  a re-run a no-op instead of a constraint error). A team goal reads the
  location-level snapshot the same way and, on crossing, awards its flat
  bonus to every participant. A challenge whose `end_date` has passed
  flips to `completed`.
- **Points, not XP, and no notifications yet — a deliberate scope
  boundary.** Phase 8 owns XP/streaks/missions/badges/notifications, but
  a challenge tier *is* a points reward
  (`challenge_tiers.points_awarded`) — "progress updates" for a
  challenge is meaningless without awarding it, so that award happens
  here, using ledger infrastructure that's existed since Phase 1. Nothing
  else gamification-shaped (XP, streak advancement, badge criteria,
  `points_earned`/`team_goal_progress`/`challenge_completed`
  notifications) is touched by this module.

**Wired to two triggers**, same pattern as leak detection: automatically
at the end of a successful CSV import, right after leak detection (spec
§19 step 9 — the last item on that list, which this closes out entirely),
and manually via an "Update Progress" button on a challenge's detail page
(`/manager/goals/[id]`) for re-running without a new upload.

**What this means for the demo data**: same coexistence pattern as Phase 6's
leak detection — the hand-seeded "Beverage Boost" participant values
(`scripts/seed.ts`) stay exactly as seeded until a real CSV import produces
employee-level `metric_snapshots` for those specific employees at Store
#37; this module was deliberately not backported into the seed script to
keep it demonstrating the real mechanism (live data → real update) rather
than a seed script pre-computing what the engine would have produced.

## Future POS adapter design (planned)

CSV import (Phase 5) is built so that it *can* become the first of several
POS adapters without a rewrite, without committing to a formal
`PosAdapter` interface before there's a second real implementation to
prove it against (one implementation is a poor teacher of what an
interface should look like — YAGNI until Toast/Square/Clover actually
exist). What's already true, concretely:

- The importer's output is the metric engine's own input shape
  (`EngineTransaction`/`EngineTransactionItem`, `src/lib/metrics/types.ts`)
  by way of the same normalized fields every adapter would need to
  produce: transaction ID, timestamp, location, employee, and line items
  with category/quantity/price/void/refund. A future API-based adapter
  needs to fill in these same fields, not learn a CSV-specific shape.
- `src/lib/csv-import/` is already split into the parts that would differ
  per source (`parse-csv.ts`, `map-rows.ts` — CSV-specific) from the parts
  that wouldn't (`validate-row.ts`, `group-transactions.ts` — "is this row
  usable" and "how do line items become a transaction" are POS-agnostic
  questions). A `ToastAdapter` would replace the first two, reuse the
  second two.
- Every write path downstream (the metric engine, and eventually the leak
  detector and challenge engine) only ever sees `transactions` /
  `transaction_items` rows — none of them know or care that a CSV upload
  produced today's rows instead of a webhook.

Formalizing an actual `PosAdapter` interface is worth doing once a second
source is being built, not before.

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
