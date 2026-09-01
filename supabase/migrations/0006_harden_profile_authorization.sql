-- Rev Catcher — harden profile authorization (two related privilege-
-- escalation holes found during the production-readiness audit)
--
-- Part 1: the original
-- handle_new_user() trigger (0003_helper_functions.sql) trusted
-- `organization_id` and `role` straight out of `raw_user_meta_data`. That
-- metadata is set the same way by two very different callers, and Postgres
-- cannot tell them apart inside the trigger:
--   1. The trusted invite path — this app's `scripts/seed.ts`, via
--      `admin.auth.createUser({ user_metadata })` using the service-role key.
--   2. An untrusted, fully public path — anyone with the anon key (which is
--      necessarily public, shipped to every browser) calling
--      `supabase.auth.signUp({ options: { data: { role: 'owner',
--      organization_id: '<any org's uuid>' } } })` directly against
--      Supabase's Auth REST API. This app has no public sign-up *UI*, but
--      that only stops people from finding the button — the Auth API
--      itself is reachable by anyone unless the project's own
--      Authentication settings disable it (Dashboard → Authentication →
--      Sign In / Providers → Email → "Allow new users to sign up" = off,
--      which pilots running this app should turn off since it's
--      invite-only by design).
-- Without that project-level setting, path 2 was a full cross-tenant
-- privilege-escalation hole: a self-registered account could grant itself
-- 'owner' in an organization it was never invited to. This migration closes
-- it at the database layer too (defense in depth, not a replacement for
-- the Dashboard setting above): every new profile now always starts
-- unprivileged and unassigned — role='employee', organization_id null,
-- the same "no organization assigned" state the UI already renders
-- gracefully everywhere (see PhaseStub usage). Assigning a real
-- organization_id/role now only happens through an explicit service-role
-- UPDATE performed right after `admin.createUser()` — a trusted
-- server-only code path RLS doesn't need to gate — never through trigger
-- logic that reads attacker-suppliable metadata. `scripts/seed.ts` was
-- updated to match.
--
-- first_name/last_name are left reading from metadata still: they're
-- cosmetic display fields, not access-control fields, so there's nothing
-- to gain by forging them, and it keeps a self-registered user's name
-- intact for whenever they're later approved into an org.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, organization_id, first_name, last_name, email, role)
  values (
    new.id,
    null,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    'employee'
  );
  return new;
end;
$$;

-- ============================================================================
-- Part 2: a second, related hole found in the same audit: profiles' two UPDATE
-- policies ("user can update own row", "managers can update org profiles",
-- 0004_rls_policies.sql) restrict which ROW can be updated but not which
-- COLUMNS or VALUES — neither has a `with check`. RLS alone can't fix this
-- (a `with check` only sees the proposed new row, not the old one, so it
-- can't cleanly express "role must not change"). That means, right now,
-- any signed-in employee can open their browser's console and run
-- `supabase.from('profiles').update({ role: 'owner' }).eq('id', myId)`
-- against this project's own public anon key + their own already-issued
-- session — no app bug or UI needed, no bypass required — and grant
-- themselves manager/owner access in their own organization. A manager
-- could do the same to a colleague's row, including moving them into a
-- different organization_id entirely.
--
-- No feature in this app performs a client-side profiles update today
-- (self-service and manager-driven profile editing are both still "ships
-- in a later phase" per the People/Settings screens' own copy), so this
-- closes the hole with zero effect on anything currently built: restrict
-- the `authenticated` role's column-level UPDATE privilege to the
-- cosmetic/operational fields a future edit-profile feature will
-- plausibly need (name, phone, avatar, active/inactive), and revoke it
-- on everything access-control-relevant (role, organization_id, email,
-- id, created_at). Those sensitive fields can still only be changed by
-- server-only, service-role code that does its own authorization check
-- (the same CLAUDE.md rule #3 pattern already used for ledger writes) —
-- e.g. `scripts/seed.ts`'s `ensureAuthUser`, or a future "invite/promote
-- employee" server action.
revoke update on profiles from authenticated;
grant update (first_name, last_name, phone, avatar_url, active) on profiles to authenticated;
