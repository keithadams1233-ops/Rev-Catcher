# Rev Catcher

Rev Catcher finds revenue leaks in POS data, quantifies the dollar opportunity,
and turns fixing them into employee challenges. Two experiences, one app:

- **Rev Catcher** (`/manager`) — owners, admins, managers, district managers.
- **Rev Rewards** (`/employee`) — frontline employees.

This repo is being built phase by phase (see `CLAUDE.md` / the master spec).
**Phase 1 (Project Foundation)** and **Phase 2 (Manager UI)** are implemented:
Next.js + Supabase wiring, the full database schema and RLS policies,
authentication, role-based routing, a dev-only role switcher, and the whole
Rev Catcher manager experience — home, revenue leaks (list + detail), the
challenge/goal builder, active challenge tracking, a people roster, and
settings. The **Rev Rewards employee screens** still show "not yet built"
placeholders — Phase 3 fills those in.

The manager screens read real rows through Supabase (not mocks), but the
*leak detection* itself (Phase 6) and the *metric engine* (Phase 4) don't
exist yet — so the 17 revenue leaks and the "Beverage Boost" challenge you'll
see after seeding are hand-authored demo data reproducing the spec's example
numbers, not something the app computed. Launching a *new* challenge from one
of those leaks, however, is real: the goal builder writes actual
`challenges`/`challenge_tiers`/`challenge_participants`/`notifications` rows
through the manager's own RLS-scoped session.

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
(summing to the spec's $47,820 / $28,340 headline numbers), and the active
"Beverage Boost" challenge at Store #37 with a 7-person leaderboard — safe to
re-run, every insert is existence-checked. (The full 14-location /
267-employee / 90-day dataset from spec §20 — and Sarah's own Rev Rewards
stats like her points balance and level — wait on the metric and
gamification engines, Phases 4 and 8, that would actually produce them.)

Demo accounts (password for all: `RevCatcher123!`):

| Role | Email |
| --- | --- |
| Owner (manager experience) | `manager@revcatcher.demo` |
| Employee — rank 1 | `kevin@revcatcher.demo` |
| Employee — rank 2 | `ana@revcatcher.demo` |
| Employee — rank 3 | `diego@revcatcher.demo` |
| Employee — rank 4 | `sarah@revcatcher.demo` |
| Employee — rank 5 | `priya@revcatcher.demo` |
| Employee — rank 6 | `marcus@revcatcher.demo` |
| Employee — rank 7 | `jamal@revcatcher.demo` |

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
    employee/          Rev Rewards shell, nav, and pages (role-gated) — still stubs
    page.tsx            role-based landing redirect
    dev-role-switch-actions.ts   dev-only view override
  components/
    manager/            manager nav + screen building blocks (stat cards, leak
                         cards, the goal builder, progress bars, status badges)
    rewards/             employee bottom nav
    dev-role-switcher.tsx
    phase-stub.tsx        "not yet built" placeholder used by future-phase screens
  lib/
    supabase/            browser/server/service-role Supabase clients + middleware
    auth/                 current-profile helper
    data/manager.ts       server-only read layer for every manager screen
    challenges/            deterministic goal-builder recommendation math
    format.ts              currency/percent/confidence formatting, shared everywhere
    dev/                   dev-view cookie helper
    types/database.ts     hand-written Supabase Database type
supabase/
  migrations/            SQL migrations, applied in filename order
scripts/
  seed.ts                 demo data: org, locations, revenue leaks, the
                           "Beverage Boost" challenge and its leaderboard
```

See `ARCHITECTURE.md` for the tenant model, schema relationships, and the
engines (metric, challenge, points/XP) that later phases build on this
foundation.
