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
   client's validation as final). *(current state of this repo)*
6. Revenue leak engine (benchmark calc, gap, revenue/profit opportunity,
   confidence classification).
7. Challenge engine (creation, participants, tiers, team goals, baseline,
   progress updates, rankings, completion).
8. Gamification engine (points, XP, levels, streaks, daily missions,
   badges, notifications).
9. ROI report (before/after challenge measurement).
10. Pilot hardening (empty states, corrupted CSV, duplicate uploads,
    refunds/voids, missing employee IDs, location changes, small samples,
    challenge cancellation, point reversals, unauthorized access, mobile
    responsiveness).

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
