-- Rev Catcher — RLS helper functions
-- security definer + stable so they can be used inside RLS policies (incl. on
-- the profiles table itself) without recursive-RLS deadlocks or leaking rows.

create or replace function current_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from profiles where id = auth.uid();
$$;

create or replace function current_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_manager_or_above()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(current_role() in ('owner', 'admin', 'manager'), false);
$$;

-- New auth.users -> profiles bootstrap. Organization/role/name are supplied
-- via signUp() options.data (raw_user_meta_data) by the server-side invite
-- flow. Defaults to role='employee' with no organization if omitted, so a
-- brand-new user always lands with a valid (if unassigned) profile row.
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
    nullif(new.raw_user_meta_data ->> 'organization_id', '')::uuid,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'employee')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
