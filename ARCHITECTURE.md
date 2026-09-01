# Architecture

Status: reflects Phase 1 (Project Foundation), Phase 2 (Manager UI),
Phase 3 (Employee UI), Phase 4 (Real Metric Engine), Phase 5 (CSV
Import), Phase 6 (Revenue Leak Engine), Phase 7 (Challenge Engine),
Phase 8 (Gamification Engine), Phase 9 (ROI Report), and Phase 10
(Pilot Hardening). Sections describing engines that don't exist yet are
marked "planned" — they document the design those phases will implement
against, not what's running today.

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
  (`supabase/migrations/0003_helper_functions.sql`, hardened by
  `0006_harden_profile_authorization.sql` — see "Known trade-offs" for
  why): every new profile starts as an unassigned `employee`
  (`organization_id` null) regardless of what a signup call's own
  metadata claims; `first_name`/`last_name` still come from
  `raw_user_meta_data` (cosmetic only). Assigning a real
  `organization_id`/`role` happens through an explicit service-role
  `UPDATE` right after `admin.createUser()` (`scripts/seed.ts`'s
  `ensureAuthUser`), never through trigger logic that trusts signup
  metadata.
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

**Real as of Phase 8**: today's mission completions, level-ups, and
streak advancement all now come from a live event — real transactions
processed by `src/lib/gamification/update-gamification.ts` — not just
hand-seeded demo data. See "Gamification engine" below for the mechanism
and its documented scope cuts (what still isn't auto-tracked, and why).

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
- **Points, not XP — a deliberate scope boundary.** A challenge tier *is*
  a points reward (`challenge_tiers.points_awarded`) — "progress
  updates" for a challenge is meaningless without awarding it, so that
  award happens here, using ledger infrastructure that's existed since
  Phase 1. XP, streak advancement, and badge criteria stay entirely
  Phase 8's own (`src/lib/gamification/update-gamification.ts`) — this
  module never touches `xp_ledger`, `streaks`, or `employee_badges`.
  Phase 8 did add the matching notifications here, though: a tier award
  now fires `points_earned`, a team goal completion fires
  `team_goal_progress` to every participant, and a challenge flipping to
  `completed` fires `challenge_completed` to every participant with
  their final rank — all through the shared `sendNotification`/
  `sendNotifications` helper in `src/lib/gamification/notify.ts`, the
  same one Phase 8's own job uses.

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

## ROI report

Spec's Phase 9 build order: "before/after challenge measurement,"
`src/lib/roi/` — the smallest engine in this app by design, because it
doesn't introduce a new formula. It reuses two that already exist:

- **`compute-roi.ts`** (pure, tested) — `computeActualImpact` calls
  `revenue-leaks/opportunity.ts`'s `calculateOpportunity` directly, just
  with a challenge's real `beforeValue`/`afterValue` filling the
  `currentValue`/`benchmarkValue` slots a leak's current-vs-benchmark
  comparison normally fills. Same formula, same anti-negative-recovery
  behavior (a regression zeroes revenue/profit but leaves `actualGap`
  as the real signed number, so a regression is visible rather than
  hidden), same `average_ticket` special case. `computeRewardRoi` is
  just the goal builder's `rewardRatio` (`src/lib/challenges/recommendations.ts`)
  called on actual numbers instead of projected ones — "profit per
  reward dollar" means the same thing either way. Reusing both instead
  of writing parallel "actual" versions is what keeps a projected
  number and its actual counterpart from ever quietly disagreeing about
  what the formula even is.
- **`get-challenge-roi.ts`** (server-only) — supplies real before/after
  inputs to `compute-roi.ts` for one already-`completed` challenge:
  `beforeValue` is `challenges.baseline_value` (real since Phase 7);
  `afterValue` is the location-level `metric_snapshot` the metric engine
  most recently computed for that location/metric — the same "current"
  value the leak detector and a team goal's tracking already read, just
  read here as "where the metric ended up." No such snapshot yet (a
  challenge that hit its `end_date` with no real POS data ever
  imported) returns `dataAvailable: false` with everything zeroed,
  never a fabricated number. Reward cost is the real `point_ledger`
  dollar total this specific challenge's tiers and team goal actually
  paid out (summed by querying `source_type in ('challenge_tier',
  'team_goal')` against that challenge's own tier/team-goal ids) — the
  *actual* cost, deliberately not the `challenges.reward_budget`
  estimate captured at launch.
- **`revenue-leaks/avg-item-price.ts`** — the attached-item pricing
  lookup `calculateOpportunity`'s `avg_attached_item_price` input needs,
  extracted out of `detect.ts` (which now calls it too, wrapped in its
  own per-run cache) so the projected and actual formulas price an item
  the exact same way instead of two copies of the same category-rule
  filter drifting apart.

**Wired to two read paths, no write/trigger of its own** — unlike every
other engine, nothing about a challenge completing needs a Phase 9 job
to run; Phase 7's `update-progress.ts` flipping `challenges.status` to
`completed` is what makes a real report available the next time either
reader runs:

- `getChallengeRoi(organizationId, challengeId)`
  (`src/lib/data/manager.ts`) — single-challenge report, returns `null`
  for any status but `completed` so the challenge detail page can show
  "available once this challenge completes" instead of a premature
  number, and renders the before/after values, actual revenue/profit
  recovered, real reward cost, and the ROI multiplier
  (`src/components/manager/stat-card.tsx` tiles) once it does.
- `getOpportunitySummary(organizationId)` — the same Manager Home
  aggregate that's existed since Phase 2, with `recoveredContributionProfit`/
  `rewardRoi` now real: summed across every completed challenge's own
  `computeChallengeRoi` call, `null` only when no challenge has
  completed yet (distinct from a real, measured zero).

Every number here carries the same estimate framing as everywhere else
in this app (CLAUDE.md rule #5) — it's a real formula fed real inputs,
not a guarantee, and the UI copy says so.

## Gamification engine

Spec §11/§12/§15, `src/lib/gamification/` — deterministic mission
progress, XP/level derivation, and badge criteria (same discipline as
every other engine: pure functions with a Vitest suite, one impure job
that writes), plus a shared notification helper Phase 7's challenge
engine now uses too.

- **`levels.ts`** — the leveling formula (`xpForLevel(level) = 500 +
  level × 100`, already used since Phase 3 for seed data and the
  employee UI's progress bar) plus `deriveLevelFromLifetimeXp`, its
  inverse: given a lifetime `xp_ledger` sum, returns the `{ level,
  currentXp }` pair it corresponds to. This is the one function that
  keeps `employee_levels` a true *derivation* of `xp_ledger` (CLAUDE.md
  rule #2) rather than an independently maintained counter — every XP
  award recomputes the whole row from the ledger's new sum through this
  function, never by incrementing `current_xp` in place.
- **`mission-progress.ts`** — reuses the Phase 4 attachment engine
  (`calculateAttachmentRate`/`DEFAULT_ATTACHMENT_RULES`) rather than
  re-deriving eligibility rules a second time: a mission against
  `beverage_attachment` is measuring the exact same thing a revenue-leak
  detector is, just scoped to one employee's transactions for
  `active_date`. `daily_missions` has no explicit "count vs. rate" flag,
  so `target_value > 1` is treated as a count target (e.g. "attach 5
  times") and `<= 1` as a rate target (e.g. "50% attachment") —
  unambiguous for every mission the spec or seed data actually uses. A
  rate mission additionally never completes below
  `MIN_SAMPLE_FOR_RATE_MISSION` (10) eligible transactions, the same
  anti-gaming floor every other engine in this app applies to a thin
  sample.
- **`badges.ts`** — data-driven against the seeded `badges` table's
  `criteria_type`/`criteria_value` columns rather than a hardcoded switch
  per badge code: `evaluateNewBadges` takes every badge definition plus
  one `BadgeEvaluationState` snapshot (current level, current streak,
  lifetime completed-mission count, team-goals-completed count, best
  challenge rank) and returns the codes newly qualified for. A manager
  adding a badge row with an existing `criteria_type` needs no code
  change to start being evaluated; an unrecognized `criteria_type` is
  never auto-awarded rather than guessed at.
- **`notify.ts`** (server-only) — a thin, shared `notifications` insert
  wrapper (`sendNotification`/`sendNotifications`) so every write (Phase
  7's challenge-tier/team-goal points, Phase 8's mission/level/badge
  events) shapes the same payload the same way instead of each engine
  reimplementing it. `NotificationType` is the DB's own enum (`new_challenge`,
  `points_earned`, `level_up`, `mission_completed`, `leaderboard_change`,
  `team_goal_progress`, `challenge_completed`, `reward_unlocked`) — the
  enum has no dedicated "badge earned" value, so a badge unlock uses
  `reward_unlocked` as the closest fit (a badge *is* an unlockable,
  distinct from a `reward_catalog` redemption) rather than adding a new
  enum value for one notification's wording.
- **`update-gamification.ts`** (server-only) — the job, run per
  organization: today's `daily_missions` progress (mission-location
  transactions grouped by employee, fed through `mission-progress.ts`) →
  XP or points awarded on first completion, gated by
  `employee_mission_progress.reward_issued` and the same
  existence-check-before-insert idempotency pattern as Phase 7's
  point-ledger helper (mirrored here for `xp_ledger` too, which has no
  `dollar_value`/`transaction_type` columns to share a helper with
  `point_ledger`) → `employee_levels` recomputed via
  `deriveLevelFromLifetimeXp` for every employee who just earned XP →
  participation streaks advanced for every employee with at least one
  clean transaction *today* (a gap since `last_qualified_date` resets to
  1, consecutive-from-yesterday increments, already-processed-today is a
  no-op) → badges evaluated org-wide against every employee's current
  level/streak/lifetime mission/team-goal/rank state → a notification for
  each mission completion, level-up, and badge unlock.

**Documented scope, same discipline as every other engine in this app:**

- Only missions whose `metric_code` is one of the four attachment
  metrics are auto-tracked. A rank-based mission (`metric_code: null`,
  e.g. the seeded "Climb One Spot") has no leaderboard-history
  infrastructure to diff against, and `average_ticket`/
  `loyalty_enrollment` missions have no defined target semantics in the
  spec's own mission examples — both are left for manual completion,
  same as Phase 7 left rank-based challenge tiers.
- Streak and mission processing looks at *today's* transactions only,
  not a historical backfill across every date a CSV import might
  contain — consistent with "daily" mission semantics (`active_date`)
  and with Phase 7's participant updates only ever reading the *latest*
  snapshot, never replaying history.
- Streak milestone bonus points (`nextStreakMilestone` in `levels.ts` —
  +250 every 5th consecutive day, shown as UI flavor text) are **not**
  auto-awarded here. Unlike a mission or a challenge tier, a streak
  milestone has no natural per-occurrence row to key `point_ledger`'s
  idempotency off — `streaks` is one mutable row per employee, not a
  ledger of individual streak-days. Faking a `source_id` for it (e.g.
  hashing employee+day) would be an idempotency guarantee only in
  appearance, not in fact, so it's left out rather than built unsafely.
- `leaderboard_change` notifications are skipped for the same reason as
  rank-based missions: no persisted rank history to diff "changed"
  against without building exactly the infrastructure that cut already
  decided not to build.
- Badge criteria are evaluated for every employee in the org on every
  run, not just employees this run's missions/streaks touched — a
  `challenge_rank_max` badge can newly qualify purely from a challenge
  completing (Phase 7's job), with no mission or streak activity that
  day at all. Org sizes here are pilot/demo scale (dozens of employees,
  not thousands), so the extra reads are cheap.
- No manual "Run Gamification Update" button, unlike Phase 6/7's "Detect
  Leaks"/"Update Progress" — this job isn't naturally tied to one
  screen the way leak detection (Leaks) or challenge progress (a
  challenge's detail page) are; it runs automatically after every CSV
  import instead (see "Wired to" below), and a future phase can add a
  manual trigger if a pilot actually needs one.

**Wired to one trigger**: automatically at the end of a successful CSV
import, as the last step of the pipeline (`src/app/manager/settings/data-sources/actions.ts`)
— after metric recalculation, leak detection, and challenge progress,
since badge criteria (`level_reached`, `challenge_rank_max`) depend on
everything computed before it in the same run.

## Pilot hardening

Spec's Phase 10 build order lists ten concerns. Most of them were already
real by the time this phase started — every prior phase's own discipline
(anti-gaming floors, idempotent ledgers, environment-agnostic
validation shared between client preview and server authority) already
covered most of what "pilot hardening" asks for. This phase's job was to
verify that claim item by item, not assume it, and fix what wasn't
actually true yet:

- **Corrupted CSV** — `src/lib/csv-import/validate-row.ts` already
  rejects a malformed row (missing/unparseable transaction ID,
  timestamp, location, item name, quantity, price) individually rather
  than failing the whole file; `parse-csv.ts` already handles an empty
  file, a header-only file, and blank lines. Confirmed still true, no
  changes needed.
- **Duplicate uploads** — dedup by `external_transaction_id` was already
  real (Phase 5). What wasn't real: `pos_imports.status` marked a
  100%-duplicate re-upload `failed`, which is wrong — nothing actually
  failed, the dedupe worked exactly as designed. Fixed in
  `src/app/manager/settings/data-sources/actions.ts`: `completed`
  whenever anything either imported or was recognized as an
  already-known duplicate; `failed` only when a file produced nothing
  usable at all (every row errored or referenced data that doesn't
  exist).
- **Refunds/voids** — `isCleanTransaction`/`isCleanItem`
  (`src/lib/metrics/eligibility.ts`) already exclude anything touched by
  a void or *any* refund, at both the transaction and line-item grain,
  from every detector. Confirmed still true.
- **Missing employee IDs** — an unresolvable employee identifier already
  imports the transaction with `employee_id = null` rather than
  rejecting the row (Phase 5's CSV import). Confirmed still true.
- **Location changes** — the one genuine gap: `locations.active` has
  existed in the schema since Phase 1 (and is displayed in Settings) but
  nothing ever *used* it. Now it's enforced in three places: CSV import
  rejects a row targeting an inactive location with a specific error
  (`data-sources/actions.ts`); `detectRevenueLeaks` fetches active
  location ids first and excludes inactive ones from both the benchmark
  input and new-leak generation, since a closed store's numbers are
  frozen, not comparable to ones still operating (`detect.ts`);
  `launchChallenge` refuses to launch a new challenge against an
  inactive-location leak (`goals/new/actions.ts`). None of this touches
  a location's *existing* open leak or running challenge — those are
  left exactly as they are, same "never overwrite what a manager
  already acted on" principle the leak/challenge engines already follow
  elsewhere. Editing a location's own `active` flag is still explicitly
  deferred ("ships in a later phase," per Settings' own copy) — this
  phase makes the column meaningful, not editable.
- **Small samples** — `MIN_DENOMINATOR_TO_REPORT` (leak detection),
  `MIN_SAMPLE_SIZE_FOR_OUTLIER_EXCLUSION` (average ticket), and
  `MIN_SAMPLE_FOR_RATE_MISSION` (Phase 8 rate missions) all already
  exist as anti-gaming floors. Confirmed still true.
- **Challenge cancellation** — `cancelChallenge()`
  (`goals/[id]/actions.ts`) already existed (Phase 2), flips a challenge
  to `cancelled`, and `update-progress.ts`/`update-gamification.ts`
  both already filter to `status = 'active'` challenges, so a cancelled
  challenge stops accumulating anything the moment it's cancelled.
  Points already earned before cancellation are deliberately left alone
  — same "never claw back what was already earned" principle as a
  challenge tier's `best_value` tracking. Confirmed still true.
- **Point reversals** — the other genuine gap: `reward_redemptions` had
  a `pending → approved/fulfilled/cancelled` status lifecycle in the
  schema since Phase 1 (RLS even already had a "managers can update
  status" policy anticipating this) but nothing in the app ever moved a
  redemption past `pending` or reversed its point debit. New:
  `cancelRedemption()` (`src/app/manager/people/actions.ts`) flips a
  `pending` redemption to `cancelled` and credits the points back via a
  *new* `point_ledger` row (`transaction_type: 'reversal'`) rather than
  editing or deleting the original debit — `point_ledger` stays
  append-only either way (CLAUDE.md rule #2). The reversal reuses the
  original debit's `source_id` (the redemption row) but under its own
  `source_type` (`redemption_reversal`, not `reward_redemption`) — the
  debit already occupies that `(employee_id, source_type, source_id)`
  key, so the reversal needs a different one to insert at all, and that
  same key is what makes cancelling the same redemption twice a no-op
  instead of a double refund. `listPendingRedemptions()`
  (`src/lib/data/manager.ts`) + a new "Pending redemptions" section on
  `/manager/people` is the manager-facing surface for it. **Known
  trade-off, not fixed here**: `redeemReward()`'s balance check and its
  ledger insert aren't one atomic transaction, so two concurrent
  redemption requests from the same employee could theoretically both
  pass the balance check before either commits, overspending by one
  redemption's worth of points — a real Postgres transaction (a
  `plpgsql` RPC, same category of fix `ARCHITECTURE.md`'s "Manager
  data-access layer" section already flags for the goal builder's
  sequential inserts) would close this, but a single pilot employee
  double-tapping fast enough to race their own request is a low-odds
  edge case not worth the added complexity yet.
- **Unauthorized access** — audited both layers rather than assuming:
  every one of the 26 tables in the schema has RLS enabled with a real
  policy (verified by diffing `create table` names against `alter table
  ... enable row level security` names — no gaps), and every Server
  Action under `src/app/**/actions.ts` checks the caller's role
  (`isManagerRole`) and sources `organization_id` from their own
  profile, never from client input, before doing anything — the same
  pattern CLAUDE.md rule #3 requires of every service-role code path.
  Confirmed already true everywhere, no changes needed.
- **Mobile responsiveness** — every wide table already had an
  `overflow-x-auto` wrapper and a `min-w-[...]` floor (import preview,
  people roster, challenge standings, the new pending-redemptions
  table), and every multi-column stat grid already collapses at a
  smaller breakpoint (`grid-cols-2 md:grid-cols-4`, the pattern
  `StatCard` rows use everywhere including the new ROI tiles).
  Confirmed still true at 375-430px.
- **Empty states** — every screen that can legitimately have zero rows
  already has one: no revenue leaks, no challenges, no imports, no
  point activity, no missions today, no active challenge to rank on, no
  one matching a People filter. Badges intentionally *hide* their
  section entirely when empty rather than showing a "no badges yet"
  message — a deliberate choice (badges are a bonus, not core
  navigation), not an oversight. Confirmed still true.

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
- **Two privilege-escalation holes fixed by a production-readiness audit
  (`0006_harden_profile_authorization.sql`), not caught by any earlier
  phase because both bypass this app's own UI/Server Actions entirely and
  hit Supabase's public APIs directly:** (1) `handle_new_user()` used to
  trust `role`/`organization_id` straight out of a new user's own signup
  metadata — indistinguishable, from the trigger's point of view, from
  the trusted service-role invite path, so anyone with the (necessarily
  public) anon key could call `supabase.auth.signUp()` directly and
  self-grant `owner` in any organization. (2) `profiles`' two UPDATE RLS
  policies restricted which *row* could be updated but not which
  *columns*, so any signed-in employee's own already-issued session could
  `update({ role: 'owner' })` on their own row. Fixed with a
  `security definer` trigger that always lands a new profile unprivileged
  and unassigned, plus revoking/re-granting column-level UPDATE on
  `profiles` so only cosmetic fields (name/phone/avatar/active) are
  writable by the `authenticated` role at all — `role`/`organization_id`
  changes now only happen through trusted service-role code. Pilots
  deploying this app should still turn off "Allow new users to sign up"
  in the Supabase dashboard's Authentication settings, since there's no
  legitimate public sign-up flow to support; the migration is defense in
  depth, not a substitute for that setting.
- **No CSP or other custom security headers configured** — relying on
  Vercel/Next's own defaults. Worth adding once there's a second
  deployment target or an actual incident to react to; not blocking for
  a single-tenant-per-deploy pilot.
- **`redeemReward`'s balance check and its ledger insert aren't one
  atomic transaction** (same category as the goal builder's sequential
  inserts, above) — two concurrent redemption requests from the same
  employee could theoretically both pass the balance check before either
  commits. A real Postgres RPC would close this; flagged, not fixed, in
  the Phase 10 pilot-hardening audit as low-odds for a single pilot
  employee to trigger against their own account.
- **A manager's own org-scoped RLS UPDATE policies (`revenue_leaks`,
  `challenges`, `challenge_tiers`, `team_goals`, `challenge_participants`,
  `daily_missions`, `reward_redemptions`) restrict the row but not the
  column/value**, same shape as the `profiles` issue above — but scoped
  entirely to a manager's *own* organization's data, which they already
  have legitimate business authority over in this app's model (nothing
  crosses a tenant boundary or grants unearned privilege). The practical
  risk is a manager manually overriding a computed number (e.g. a
  `challenge_participants.points_earned` value) via a direct API call
  instead of through the deterministic engines — a same-tenant
  data-integrity concern, not unauthorized access. Not hardened in this
  pass; worth column-scoping the same way if a pilot surfaces it as a
  real problem.
- **No `loading.tsx`/`error.tsx` existed before the production-readiness
  audit** — every screen does a real Supabase fetch with nothing shown
  while it's in flight, and an unhandled Server Component error fell
  through to Next's raw default error page. Fixed with a `loading.tsx`
  and `error.tsx` per experience (`src/app/manager/`, `src/app/employee/`)
  in each surface's own visual language, plus a root `not-found.tsx` for
  an unmatched route.
