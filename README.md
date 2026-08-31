# Rev Catcher

Rev Catcher finds revenue leaks in POS data, quantifies the dollar opportunity,
and turns fixing them into employee challenges. Two experiences, one app:

- **Rev Catcher** (`/manager`) — owners, admins, managers, district managers.
- **Rev Rewards** (`/employee`) — frontline employees.

This repo is being built phase by phase (see `CLAUDE.md` / the master spec).
**Phases 1–3 are implemented**: Next.js + Supabase wiring, the full database
schema and RLS policies, authentication, role-based routing, a dev-only role
switcher, the whole Rev Catcher manager experience (home, revenue leaks,
goal builder, challenge tracking, people, settings), and the whole Rev
Rewards employee experience (home, missions, leaderboard, points wallet,
rewards, XP/levels/streaks/badges).

Every screen reads real rows through Supabase (not mocks), but two engines
that would *produce* those rows live don't exist yet:

- **Leak detection** (Phase 6) and the **metric engine** (Phase 4) — so the
  17 revenue leaks and the "Beverage Boost" challenge you'll see after
  seeding are hand-authored demo data reproducing the spec's example
  numbers, not something the app computed.
- **The gamification engine** (Phase 8) — so points/XP/streaks/mission
  progress are seeded starting values, not the result of a live shift.

Two flows *are* real writes, not mockups, because they only need the
manager's or employee's own session, not a missing engine: the goal builder
launches an actual challenge (`challenges`/`challenge_tiers`/
`challenge_participants`/`notifications` rows), and redeeming a reward
actually spends the employee's real point balance (checked server-side
before the write).

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS, mobile-first.
- **Backend:** Supabase (Postgres, Auth, Row Level Security).
- **Hosting:** Vercel.

## Local setup

### 1. Prerequisites

- Node.js 20+
- A free [Supabase](https://supabase.com) project

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` from your Supabase project's **Settings → API** page:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys → `service_role` (**secret** — server-only, never commit it, never import it into client code) |

### 4. Run the database migrations

Migrations live in `supabase/migrations/`, in order:

1. `0001_initial_schema.sql` — every table in the spec (organizations →
   locations → employees, transactions, metrics, revenue leaks, challenges,
   gamification ledgers, rewards, notifications).
2. `0002_reference_data.sql` — the six metric definitions, eight badges, and
   the four global reward tiers ($5/$10/$25/$50).
3. `0003_helper_functions.sql` — RLS helper functions (`current_org_id()`,
   `current_role()`, `is_manager_or_above()`) and the `auth.users` →
   `profiles` bootstrap trigger.
4. `0004_rls_policies.sql` — Row Level Security for every tenant-scoped
   table.

Apply them with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste each file's contents into the Supabase SQL Editor, in order, if you
aren't using the CLI.

### 5. Seed demo data

```bash
npm run seed
```

Creates "ABC Restaurant Holdings" with 5 locations, 17 revenue leaks
(summing to the spec's $47,820 / $28,340 headline numbers), the active
"Beverage Boost" challenge at Store #37 with a 7-person leaderboard, and
each of those 7 employees' level/XP/streak/points/badges/daily-mission
progress — safe to re-run, every insert is existence-checked. (The full
14-location / 267-employee / 90-day dataset from spec §20 waits on the
metric engine, Phase 4, that would actually produce it.)

Demo accounts (password for all: `RevCatcher123!`) — Sarah's stats
(8,450 points, level 12, 11-day streak, rank 4) match the spec's own §20
example exactly:

| Role | Email | Level | Points | Streak |
| --- | --- | --- | --- | --- |
| Owner (manager experience) | `manager@revcatcher.demo` | — | — | — |
| Employee — rank 1 | `kevin@revcatcher.demo` | 15 | 9,200 | 8d |
| Employee — rank 2 | `ana@revcatcher.demo` | 13 | 8,900 | 9d |
| Employee — rank 3 | `diego@revcatcher.demo` | 9 | 7,600 | 4d |
| Employee — rank 4 | `sarah@revcatcher.demo` | 12 | 8,450 | 11d |
| Employee — rank 5 | `priya@revcatcher.demo` | 7 | 6,200 | 2d |
| Employee — rank 6 | `marcus@revcatcher.demo` | 6 | 5,100 | 0d |
| Employee — rank 7 | `jamal@revcatcher.demo` | 5 | 4,300 | 1d |

### 6. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Signed-out visitors go
to `/login`; signed-in users are routed automatically to `/manager` or
`/employee` based on their role.

### Dev-only role switcher

While `NODE_ENV !== "production"`, a **Manager view / Employee view** toggle
appears in the header of both experiences. It overrides which experience you
see (via a cookie) without changing the signed-in user's actual role, so a
single account can walk the whole demo flow (manager → launch challenge →
employee view → notification → leaderboard → rewards). It renders nothing
in a production build.

## Other scripts

```bash
npm run lint    # ESLint
npm run build   # production build (also type-checks)
npm run start   # run a production build locally
```

## Deployment (Vercel)

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com/new).
3. Set the same three environment variables from `.env.local` in the Vercel
   project settings (Production + Preview).
4. Deploy. Vercel builds with `next build` and serves the App Router
   automatically — no extra configuration needed.

Run the Supabase migrations against your production project the same way as
local setup (steps 4–5) before the first deploy goes live.

## Project structure

```
src/
  app/
    login/            sign-in page + server actions
    manager/           Rev Catcher screens (role-gated) — home, leaks, leaks/[id],
                         goals (list + [id] + new builder), people, settings
    employee/          Rev Rewards screens (role-gated) — home, missions, ranks,
                         points, rewards (+ the reward-redemption server action)
    page.tsx            role-based landing redirect
    dev-role-switch-actions.ts   dev-only view override
  components/
    manager/            manager nav + screen building blocks (stat cards, leak
                         cards, the goal builder, progress bars, status badges)
    rewards/             employee nav + screen building blocks (gradient progress
                         bars, level/points/streak tiles, challenge/mission cards,
                         badge pills, redeem button)
    dev-role-switcher.tsx
    phase-stub.tsx        "not yet built" placeholder used by future-phase screens
  lib/
    supabase/            browser/server/service-role Supabase clients + middleware
    auth/                 current-profile helper
    data/
      manager.ts           server-only read layer for every manager screen
      employee.ts           server-only read layer for every employee screen
      rewards.ts             reward catalog reads (role-agnostic — used by both)
    challenges/            deterministic goal-builder recommendation math
    gamification/          level/XP formula + streak milestone math (spec §15)
    format.ts              currency/percent/confidence formatting, shared everywhere
    dev/                   dev-view cookie helper
    types/database.ts     hand-written Supabase Database type
supabase/
  migrations/            SQL migrations, applied in filename order
scripts/
  seed.ts                 demo data: org, locations, revenue leaks, the
                           "Beverage Boost" challenge, and every seeded
                           employee's level/XP/streak/points/badges/missions
```

See `ARCHITECTURE.md` for the tenant model, schema relationships, and the
engines (metric, challenge, gamification) that later phases build on this
foundation.
