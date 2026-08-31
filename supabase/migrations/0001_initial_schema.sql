-- Rev Catcher — Phase 1 initial schema
-- Multi-tenant model: organizations -> locations -> employees (profiles)
-- All tenant-scoped tables carry organization_id for RLS isolation.

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type user_role as enum ('owner', 'admin', 'manager', 'employee');
create type pos_import_status as enum ('uploaded', 'processing', 'completed', 'failed');
create type revenue_leak_status as enum ('open', 'challenge_created', 'dismissed', 'resolved');
create type challenge_status as enum ('draft', 'scheduled', 'active', 'completed', 'cancelled');
create type mission_reward_type as enum ('xp', 'points');
create type point_transaction_type as enum ('earn', 'redeem', 'adjustment', 'reversal');
create type redemption_status as enum ('pending', 'approved', 'fulfilled', 'cancelled');
create type notification_type as enum (
  'new_challenge',
  'points_earned',
  'level_up',
  'mission_completed',
  'leaderboard_change',
  'team_goal_progress',
  'challenge_completed',
  'reward_unlocked'
);

-- ============================================================================
-- HELPER: updated_at trigger
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  subscription_status text not null default 'trial',
  timezone text not null default 'America/New_York',
  default_point_value numeric(10, 4) not null default 100 -- points per $1 (100 points = $1)
);

-- ============================================================================
-- LOCATIONS
-- ============================================================================

create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  external_id text,
  address text,
  timezone text not null default 'America/New_York',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index locations_org_idx on locations(organization_id);
create unique index locations_org_external_idx on locations(organization_id, external_id) where external_id is not null;

-- ============================================================================
-- PROFILES (extends auth.users)
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  phone text,
  role user_role not null default 'employee',
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index profiles_org_idx on profiles(organization_id);
create index profiles_role_idx on profiles(organization_id, role);

-- ============================================================================
-- EMPLOYEE_LOCATIONS (many-to-many)
-- ============================================================================

create table employee_locations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  primary_location boolean not null default false,
  created_at timestamptz not null default now(),
  unique (employee_id, location_id)
);

create index employee_locations_employee_idx on employee_locations(employee_id);
create index employee_locations_location_idx on employee_locations(location_id);

-- ============================================================================
-- POS IMPORTS
-- ============================================================================

create table pos_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  filename text not null,
  status pos_import_status not null default 'uploaded',
  imported_at timestamptz not null default now(),
  date_start date,
  date_end date,
  row_count integer not null default 0,
  error_count integer not null default 0,
  import_type text not null default 'csv'
);

create index pos_imports_org_idx on pos_imports(organization_id);

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================

create table transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  external_transaction_id text not null,
  employee_id uuid references profiles(id) on delete set null,
  transaction_timestamp timestamptz not null,
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  refund_amount numeric(12, 2) not null default 0,
  voided boolean not null default false,
  customer_id text,
  order_channel text not null default 'in_store',
  imported_at timestamptz not null default now(),
  unique (organization_id, external_transaction_id)
);

create index transactions_org_idx on transactions(organization_id);
create index transactions_location_idx on transactions(location_id);
create index transactions_employee_idx on transactions(employee_id);
create index transactions_timestamp_idx on transactions(transaction_timestamp);

-- ============================================================================
-- TRANSACTION_ITEMS
-- ============================================================================

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  employee_id uuid references profiles(id) on delete set null,
  external_item_id text,
  item_name text not null,
  category text,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  total_price numeric(12, 2) not null default 0,
  modifier_names text[] not null default '{}',
  refunded boolean not null default false,
  voided boolean not null default false,
  created_at timestamptz not null default now()
);

create index transaction_items_transaction_idx on transaction_items(transaction_id);
create index transaction_items_org_idx on transaction_items(organization_id);
create index transaction_items_location_idx on transaction_items(location_id);
create index transaction_items_category_idx on transaction_items(location_id, category);

-- ============================================================================
-- METRIC_DEFINITIONS
-- ============================================================================

create table metric_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  metric_type text not null default 'attachment_rate',
  numerator_definition text,
  denominator_definition text,
  active boolean not null default true
);

-- ============================================================================
-- METRIC_SNAPSHOTS
-- ============================================================================

create table metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  employee_id uuid references profiles(id) on delete set null,
  metric_code text not null references metric_definitions(code),
  period_start date not null,
  period_end date not null,
  numerator numeric(14, 2) not null default 0,
  denominator numeric(14, 2) not null default 0,
  value numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index metric_snapshots_org_idx on metric_snapshots(organization_id);
create index metric_snapshots_location_metric_idx on metric_snapshots(location_id, metric_code, period_start);
create index metric_snapshots_employee_metric_idx on metric_snapshots(employee_id, metric_code, period_start);

-- ============================================================================
-- REVENUE_LEAKS
-- ============================================================================

create table revenue_leaks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  metric_code text not null references metric_definitions(code),
  current_value numeric(10, 6) not null,
  benchmark_value numeric(10, 6) not null,
  gap numeric(10, 6) not null,
  estimated_incremental_revenue numeric(12, 2) not null default 0,
  estimated_contribution_profit numeric(12, 2) not null default 0,
  confidence_score numeric(4, 3) not null default 0.5,
  status revenue_leak_status not null default 'open',
  detected_at timestamptz not null default now()
);

create index revenue_leaks_org_idx on revenue_leaks(organization_id);
create index revenue_leaks_location_idx on revenue_leaks(location_id);
create index revenue_leaks_status_idx on revenue_leaks(organization_id, status);

-- ============================================================================
-- CHALLENGES
-- ============================================================================

create table challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  revenue_leak_id uuid references revenue_leaks(id) on delete set null,
  title text not null,
  description text,
  metric_code text not null references metric_definitions(code),
  start_date date not null,
  end_date date not null,
  baseline_value numeric(10, 6) not null default 0,
  target_value numeric(10, 6) not null,
  projected_incremental_revenue numeric(12, 2) not null default 0,
  projected_contribution_profit numeric(12, 2) not null default 0,
  reward_budget numeric(12, 2) not null default 0,
  status challenge_status not null default 'draft',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index challenges_org_idx on challenges(organization_id);
create index challenges_location_idx on challenges(location_id);
create index challenges_status_idx on challenges(organization_id, status);

-- ============================================================================
-- CHALLENGE_TIERS
-- ============================================================================

create table challenge_tiers (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  name text not null,
  threshold_value numeric(10, 6) not null,
  points_awarded integer not null,
  rank_order integer not null
);

create index challenge_tiers_challenge_idx on challenge_tiers(challenge_id, rank_order);

-- ============================================================================
-- CHALLENGE_PARTICIPANTS
-- ============================================================================

create table challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  baseline_value numeric(10, 6) not null default 0,
  current_value numeric(10, 6) not null default 0,
  best_value numeric(10, 6) not null default 0,
  points_earned integer not null default 0,
  rank integer,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (challenge_id, employee_id)
);

create trigger challenge_participants_set_updated_at
  before update on challenge_participants
  for each row execute function set_updated_at();

create index challenge_participants_challenge_idx on challenge_participants(challenge_id);
create index challenge_participants_employee_idx on challenge_participants(employee_id);

-- ============================================================================
-- TEAM_GOALS
-- ============================================================================

create table team_goals (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  target_value numeric(10, 6) not null,
  current_value numeric(10, 6) not null default 0,
  points_awarded_per_employee integer not null default 0,
  completed boolean not null default false
);

create index team_goals_challenge_idx on team_goals(challenge_id);

-- ============================================================================
-- DAILY_MISSIONS
-- ============================================================================

create table daily_missions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid references challenges(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  title text not null,
  description text,
  metric_code text references metric_definitions(code),
  target_value numeric(10, 6) not null,
  reward_type mission_reward_type not null default 'xp',
  reward_amount integer not null default 0,
  active_date date not null,
  created_at timestamptz not null default now()
);

create index daily_missions_org_date_idx on daily_missions(organization_id, active_date);
create index daily_missions_location_date_idx on daily_missions(location_id, active_date);

-- ============================================================================
-- EMPLOYEE_MISSION_PROGRESS
-- ============================================================================

create table employee_mission_progress (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references daily_missions(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  current_value numeric(10, 6) not null default 0,
  completed boolean not null default false,
  reward_issued boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (mission_id, employee_id)
);

create trigger employee_mission_progress_set_updated_at
  before update on employee_mission_progress
  for each row execute function set_updated_at();

create index employee_mission_progress_employee_idx on employee_mission_progress(employee_id);

-- ============================================================================
-- POINT_LEDGER (immutable — balance is always SUM(points))
-- ============================================================================

create table point_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  transaction_type point_transaction_type not null,
  source_type text not null,
  source_id uuid,
  points integer not null,
  dollar_value numeric(12, 2) not null default 0,
  description text,
  created_at timestamptz not null default now()
);

create index point_ledger_employee_idx on point_ledger(employee_id);
create index point_ledger_org_idx on point_ledger(organization_id);
-- Idempotency guard: at most one ledger row per (employee, source_type, source_id)
-- for automated earn/reversal awards. Manual adjustments/redemptions pass source_id = null.
create unique index point_ledger_idempotency_idx
  on point_ledger(employee_id, source_type, source_id)
  where source_id is not null;

-- ============================================================================
-- XP_LEDGER
-- ============================================================================

create table xp_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  xp integer not null,
  description text,
  created_at timestamptz not null default now()
);

create index xp_ledger_employee_idx on xp_ledger(employee_id);
create unique index xp_ledger_idempotency_idx
  on xp_ledger(employee_id, source_type, source_id)
  where source_id is not null;

-- ============================================================================
-- EMPLOYEE_LEVELS
-- ============================================================================

create table employee_levels (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references profiles(id) on delete cascade,
  current_level integer not null default 1,
  current_xp integer not null default 0,
  lifetime_xp integer not null default 0,
  updated_at timestamptz not null default now()
);

create trigger employee_levels_set_updated_at
  before update on employee_levels
  for each row execute function set_updated_at();

-- ============================================================================
-- STREAKS
-- ============================================================================

create table streaks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  streak_type text not null default 'participation',
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_qualified_date date,
  updated_at timestamptz not null default now(),
  unique (employee_id, streak_type)
);

create trigger streaks_set_updated_at
  before update on streaks
  for each row execute function set_updated_at();

-- ============================================================================
-- BADGES
-- ============================================================================

create table badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  icon text,
  criteria_type text not null,
  criteria_value numeric(10, 2)
);

-- ============================================================================
-- EMPLOYEE_BADGES
-- ============================================================================

create table employee_badges (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  badge_id uuid not null references badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (employee_id, badge_id)
);

create index employee_badges_employee_idx on employee_badges(employee_id);

-- ============================================================================
-- REWARD_CATALOG
-- ============================================================================

create table reward_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  description text,
  point_cost integer not null,
  dollar_value numeric(12, 2) not null,
  reward_type text not null default 'gift_card',
  active boolean not null default true
);

create index reward_catalog_org_idx on reward_catalog(organization_id);

-- ============================================================================
-- REWARD_REDEMPTIONS
-- ============================================================================

create table reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  reward_id uuid not null references reward_catalog(id) on delete restrict,
  points_spent integer not null,
  dollar_value numeric(12, 2) not null,
  status redemption_status not null default 'pending',
  redeemed_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index reward_redemptions_org_idx on reward_redemptions(organization_id);
create index reward_redemptions_employee_idx on reward_redemptions(employee_id);
create index reward_redemptions_status_idx on reward_redemptions(organization_id, status);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications(user_id, read);
create index notifications_org_idx on notifications(organization_id);
