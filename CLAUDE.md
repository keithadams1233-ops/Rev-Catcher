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
2. **Points and XP are immutable ledgers, never a mutable balance column.**
   Balance is always `SUM(points)` / `SUM(xp)`. Every award needs
   `source_type` + `source_id` and must go through the ledger's partial
   unique index (idempotency) — see `ARCHITECTURE.md`. Never add a
   `points_balance` column anywhere.
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
   not computed (that's Phases 4 & 6). *(current state of this repo)*
3. Employee UI (home, missions, leaderboard, points wallet, rewards, XP,
   levels, streaks, badges) — against seed data. Still stubbed.
4. Real metric engine (beverage/dessert/add-on attachment, average ticket,
   premium upgrade) + unit tests.
5. CSV import (upload → column mapping → validation → normalization →
   dedupe by `external_transaction_id` → triggers metric recalculation).
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
  (`npx supabase gen types typescript`).
- New tables: add the migration, add RLS policies in the same PR/commit,
  add the TS type, update `ARCHITECTURE.md`'s schema section.
- **Manager screen data access goes through `src/lib/data/manager.ts`**
  (server-only, `organizationId` always sourced server-side). Add the
  equivalent `src/lib/data/employee.ts` when Phase 3 needs it — same
  pattern, own file, don't mix manager and employee reads in one module.
- **Don't use PostgREST embedded selects** (`.select("*, locations(name)")`)
  against our hand-written `Database` type — its `Relationships` arrays are
  all `[]`, so postgrest-js can't type-check the embed. Do two plain
  queries and zip them in TS instead (see any function in
  `src/lib/data/manager.ts`). This goes away once real generated types
  exist.
- If a Supabase query starts typing its result as `never`, check
  `@supabase/ssr`'s version before anything else — see ARCHITECTURE.md's
  "Known trade-offs" for what happened last time.
- Run `npm run lint` and `npm run build` before considering any phase done;
  fix failures rather than skipping them.
- Money: `numeric(12,2)`. Rates/percentages: `numeric(10,6)` stored as a
  0–1 fraction (display as `× 100` with a `%`). Points/XP: integers.
  Formatting helpers for all of this live in `src/lib/format.ts` — use them
  rather than re-deriving `toFixed`/`Intl.NumberFormat` calls per screen.
