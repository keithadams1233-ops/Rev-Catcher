# CLAUDE.md

Project rules for Rev Catcher, for any future Claude Code session working in
this repo. Read `ARCHITECTURE.md` for how things fit together and `README.md`
for local setup before making changes.

## What this is

A two-experience SaaS MVP: **Rev Catcher** (manager: finds revenue leaks,
launches challenges) and **Rev Rewards** (employee: gamified progress
toward those challenges). Full spec was provided at project start as a
phased build order — follow the phase currently in progress; don't jump
ahead to a later phase's functionality without being asked.

## Non-negotiable rules

1. **Multi-tenant isolation is enforced in Postgres RLS, not app code.**
   Every tenant-scoped table filters on `organization_id` via `current_org_id()`
   (see `ARCHITECTURE.md` → "Isolation: Row Level Security"). Never write a
   query that trusts an `organization_id` supplied by the client. Never add
   a table without RLS enabled and a policy.
2. **Points balance is always `SUM(point_ledger.points)` — never a stored
   balance column.** `getPointsBalance()` in `src/lib/data/employee.ts`
   computes it live, every time. Every award needs `source_type` +
   `source_id` and must go through the ledger's partial unique index
   (idempotency) — see `ARCHITECTURE.md`. Never add a `points_balance`
   column anywhere.
   `employee_levels` (current_level/current_xp/lifetime_xp) and `streaks`
   (current_streak/longest_streak) are the one deliberate exception: the
   spec's own schema defines them as maintained snapshot tables, not raw
   ledgers, for fast reads. `xp_ledger` is still the source of truth —
   `employee_levels` must only ever be *derived* from it (by the
   server-side code that awards XP, never hand-edited elsewhere), so it
   can't silently drift out of sync. Seed data enforces this by
   construction: every seeded `employee_levels.lifetime_xp` has a matching
   `xp_ledger` sum (see `ensureXpBalance` in `scripts/seed.ts`).
3. **Points/XP/levels/streaks/badges/metrics/leaks are server-written only.**
   These tables intentionally have no client insert/update RLS policy.
   Writes happen through service-role server code (`createServiceRoleClient()`
   in `src/lib/supabase/server.ts`), which is responsible for its own
   authorization checks since RLS won't stop it. Never add a client-side
   insert policy to these tables as a shortcut.
4. **Never expose the service-role key to the client.** It's read only in
   `createServiceRoleClient()`, server-side. Don't import that function (or
   `SUPABASE_SERVICE_ROLE_KEY`) into anything under `"use client"`.
5. **Estimates are estimates.** Revenue opportunity, contribution profit,
   ROI — always label them as estimated/projected in UI copy. Never imply a
   guarantee.
6. **Deterministic math for anything that can be deterministic.** The
   detection engine (attachment rates, revenue opportunity, contribution
   profit) is plain SQL/TS arithmetic — no AI/ML for calculations covered
   by the spec's formulas.
7. **Anti-gaming rules are not optional polish.** Exclude voided/refunded
   transactions from metrics, enforce minimum eligible-transaction counts
   before ranking anyone, never rank on raw sales.
8. **Manager UI and employee UI are visually distinct on purpose.** Manager
   (`manager-*` Tailwind tokens) is dark/serious/financial. Employee
   (`rewards-*` Tailwind tokens) is higher-energy — gradients, celebration
   states — but never childish. Don't blend the two palettes.
9. **Mobile-first.** Design and test primarily at 375/390/393/430px wide.
   Desktop (sidebar nav for manager) is secondary but must still work.
10. **The dev role switcher is dev/demo-only.** It must stay inert
    (`isDevModeEnabled()` returns `false`) whenever `NODE_ENV === "production"`.
    Never make it available to real users in production.

## Build order

Phases are sequential (see the original spec for full detail). Do not start
a phase's work until the previous one is verified (lint + build passing,
changes summarized). Within a phase: inspect current state → plan briefly →
implement → run lint/build → fix failures → summarize → stop for
substantial phases rather than cascading into the next one unprompted.

1. **Project foundation** ✅ — Next.js/TS/Tailwind/Supabase, full schema +
   RLS, auth, role routing, dev role switcher, seed script.
2. **Manager UI** ✅ — home, revenue leaks (list + detail), goal builder
   (launches real challenges), goals list + active challenge detail, people
   roster, settings. Reads through `src/lib/data/manager.ts` against real
   rows; the leaks/challenge *data itself* is still hand-seeded demo data,
   not computed (that's Phases 4 & 6).
3. **Employee UI** ✅ — home, missions, leaderboard, points wallet, rewards,
   XP, levels, streaks, badges. Reads through `src/lib/data/employee.ts`
   against real rows; reward redemption is a real write (validated
   service-role server action, spending an employee's actual point
   balance).
4. **Real metric engine** ✅ — `src/lib/metrics/`: beverage/dessert/add-on/
   premium-upgrade attachment + average ticket, all pure functions with a
   Vitest suite (`npm test`). Not wired to anything yet — no real POS data
   exists until Phase 5, and nothing calls it from a live route.
5. **CSV import** ✅ — Settings → Data Sources: upload → column mapping
   (auto-guessed, reusable per org) → validation → normalization → dedupe
   by `external_transaction_id` → writes `transactions`/`transaction_items`
   → triggers metric recalculation (`src/lib/metrics/recalculate.ts`).
   `src/lib/csv-import/` is environment-agnostic (client preview + server
   authoritative re-validation share the same functions — never trust the
   client's validation as final).
6. **Revenue leak engine** ✅ — `src/lib/revenue-leaks/`: benchmark calc
   (top-quartile vs. org-average per spec §7), gap, revenue/profit
   opportunity (matches spec §8's worked example exactly as a test),
   confidence classification. `detect.ts` reads `metric_snapshots` and
   upserts `revenue_leaks` — run automatically after CSV import and
   manually via "Detect Leaks" on `/manager/leaks`. Manager-configurable
   category rules and contribution margins are still just defaults, not
   persisted — same deferral as Phase 4.
7. **Challenge engine** ✅ — creation/participants/tiers/team
   goals/baseline were real as of Phase 2; Phase 7 adds
   `src/lib/challenges/update-progress.ts`: reads each participant's own
   latest `metric_snapshot`, awards `challenge_tiers.points_awarded` to
   `point_ledger` idempotently on newly-crossed tiers (same source_type +
   source_id pattern as everywhere else), recomputes rankings, updates
   team goals (flat bonus to everyone on completion), and flips a
   challenge to `completed` once `end_date` passes. Baseline is now a
   real per-employee `metric_snapshot` lookup at launch, falling back to
   the leak's location-level value only when an employee has none yet.
   Run automatically after CSV import (closing out every step of spec
   §19) and manually via "Update Progress" on a challenge's detail page.
8. **Gamification engine** ✅ — `src/lib/gamification/`: daily mission
   progress (reuses the Phase 4 attachment engine, scoped to one
   employee's transactions for `active_date`), XP/points awarded on
   first completion (idempotent, same source_type+source_id pattern as
   everywhere else), `employee_levels` recomputed via
   `deriveLevelFromLifetimeXp` (never hand-incremented), participation
   streaks advanced for today, and badges evaluated org-wide, data-driven
   against `badges.criteria_type`/`criteria_value`. Notifications
   (`mission_completed`, `level_up`, `reward_unlocked` for badges) go
   through a shared `notify.ts` helper that Phase 7's challenge progress
   job was retrofitted to use too (`points_earned`, `team_goal_progress`,
   `challenge_completed`). Run automatically after CSV import, as the
   last step of the pipeline. Documented scope cuts (not silently
   skipped — see ARCHITECTURE.md's "Gamification engine" section):
   rank-based missions and `leaderboard_change` notifications (no
   leaderboard-history infra), streak milestone bonus points (no safe
   idempotency key for a repeating same-employee event), and daily
   mission *generation* (missions stay manager/seed-created).
9. **ROI report** ✅ — `src/lib/roi/`: `compute-roi.ts` (pure,
   `computeActualImpact` + `computeRewardRoi`) deliberately reuses the
   Phase 6 opportunity formula and the goal builder's `rewardRatio`
   rather than a parallel "actual" formula that could drift from the
   "projected" one — a challenge's real before/after values just take
   the same `currentValue`/`benchmarkValue` slots a leak's
   current-vs-benchmark comparison already fills.
   `get-challenge-roi.ts` (server-only) reads the real inputs: `before`
   is `challenges.baseline_value` (real since Phase 7), `after` is the
   location's latest `metric_snapshot` for that metric, and reward cost
   is the real `point_ledger` dollar total this challenge's tiers/team
   goal actually paid out (not the launch-time `reward_budget`
   estimate) — returns `dataAvailable: false` rather than a fabricated
   number when no snapshot exists yet. `avg-item-price.ts` (extracted
   out of Phase 6's `detect.ts`, which now calls it too) is the shared
   attached-item pricing lookup both the projected and actual formulas
   need. Wired into `getChallengeRoi()` (single challenge, shown on a
   completed challenge's detail page) and `getOpportunitySummary()`
   (org-wide sum, Manager Home's "Recovered profit"/"Reward ROI" tiles
   — real numbers as of this phase, previously a `null` placeholder).
   No new trigger: a challenge's own completion (Phase 7) is what makes
   a real report available; nothing separate to run.
10. **Pilot hardening** ✅ — most of this list was already real by
    construction from prior phases' own discipline (anti-gaming floors,
    idempotent ledgers, environment-agnostic validation); audited each
    item and fixed the two genuine gaps found:
    - **Location changes**: `locations.active` (schema since Phase 1,
      never enforced anywhere) now actually gates things — CSV import
      rejects a row targeting an inactive location with a clear error,
      `detectRevenueLeaks` excludes inactive locations from both
      benchmarking and new leaks (a closed store's numbers are frozen,
      not comparable), and `launchChallenge` refuses to launch against
      an inactive-location leak. An already-open leak or already-running
      challenge at a location that goes inactive is left alone either
      way — same "don't overwrite what a manager already acted on"
      principle as everywhere else.
    - **Point reversals**: reward redemptions had a `pending` →
      `fulfilled` lifecycle in the schema since Phase 1 but no way to
      undo one. `cancelRedemption()` (`src/app/manager/people/actions.ts`)
      flips a pending redemption to `cancelled` and reverses the point
      debit via a new, idempotent `point_ledger` row
      (`transaction_type: 'reversal'`, its own `source_type` so it can't
      collide with the original debit's idempotency key) — a "Pending
      redemptions" section on `/manager/people` is the new manager
      surface for it.
    - **Duplicate uploads**: found and fixed a real bug while auditing
      this one — a CSV that's 100% already-imported duplicates got
      marked `failed` in `pos_imports` (misleadingly, since nothing was
      actually wrong). Now `completed` whenever anything either
      imported or was recognized as a known duplicate; `failed` is
      reserved for a file that produced nothing usable at all.
    - Everything else on the list — corrupted CSV, refunds/voids,
      missing employee IDs, small samples, challenge cancellation,
      unauthorized access, mobile responsiveness — was audited and
      confirmed already handled by earlier phases (RLS on all 26
      tables verified complete; every Server Action checks role + org
      before writing); see ARCHITECTURE.md's "Pilot hardening" section
      for the specifics of what was checked and why nothing else needed
      changing.
    *(current state of this repo)*

## Conventions

- **Never leave a fake/TODO implementation for core MVP behavior without
  clearly labeling it.** Screens not yet built use `<PhaseStub>`
  (`src/components/phase-stub.tsx`), which says explicitly what's missing
  and which phase builds it — never a screen that looks finished but isn't.
- Supabase clients: `src/lib/supabase/client.ts` (browser),
  `server.ts` → `createClient()` (server, session-scoped, RLS applies) and
  `createServiceRoleClient()` (server, RLS bypassed — trusted code only).
- Database types are hand-written in `src/lib/types/database.ts`, mirroring
  `supabase/migrations/*.sql` exactly. Update both together. Regenerate for
  real once a live Supabase project exists
  (`npx supabase gen types typescript`). Use the `Tables<'x'>` /
  `Inserts<'x'>` / `Updates<'x'>` helpers exported from that file rather
  than reaching into `Database["public"]["Tables"]["x"]["Row"]` by hand.
- New tables: add the migration, add RLS policies in the same PR/commit,
  add the TS type, update `ARCHITECTURE.md`'s schema section.
- **Manager screen data access goes through `src/lib/data/manager.ts`**,
  **employee screen data access through `src/lib/data/employee.ts`** —
  same pattern (server-only, `organizationId`/`employeeId` always sourced
  server-side), separate files; don't mix manager and employee reads in
  one module. Data that's genuinely role-agnostic (e.g. the reward
  catalog) gets its own file instead (`src/lib/data/rewards.ts`) rather
  than living in either.
- **Don't use PostgREST embedded selects** (`.select("*, locations(name)")`)
  against our hand-written `Database` type — its `Relationships` arrays are
  all `[]`, so postgrest-js can't type-check the embed. Do two plain
  queries and zip them in TS instead (see any function in
  `src/lib/data/manager.ts`). This goes away once real generated types
  exist.
- If a Supabase query starts typing its result as `never`, check
  `@supabase/ssr`'s version before anything else — see ARCHITECTURE.md's
  "Known trade-offs" for what happened last time.
- Run `npm run lint`, `npm run build`, and `npm test` before considering any
  phase done; fix failures rather than skipping them.
- **Deterministic business logic (metric formulas, gamification math,
  anything with a formula in the spec) is a pure function with a Vitest
  suite next to it** (`*.test.ts` beside the module it tests — see
  `src/lib/metrics/`). Not a UI-only concern to eyeball; write the test.
- **Validation/normalization logic that a client needs for live preview
  and a server needs as the authoritative check is one environment-agnostic
  module, not two.** `src/lib/csv-import/` has no Supabase client, no
  Next.js — the upload wizard runs it client-side for instant preview, the
  Server Action re-runs the exact same functions server-side and never
  trusts the client's result. Reach for this pattern again anywhere else
  a "preview before you commit" UI shows up.
- Money: `numeric(12,2)`. Rates/percentages: `numeric(10,6)` stored as a
  0–1 fraction (display as `× 100` with a `%`). Points/XP: integers.
  Formatting helpers for all of this live in `src/lib/format.ts` — use them
  rather than re-deriving `toFixed`/`Intl.NumberFormat` calls per screen.
