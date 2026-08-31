-- Rev Catcher — Row Level Security
-- One organization must never see another organization's data. Every
-- tenant-scoped table is locked down to current_org_id() at minimum;
-- several tables further restrict employees to their own rows and leave
-- writes to server-side/service-role code paths (ledgers, computed stats).

alter table organizations enable row level security;
alter table locations enable row level security;
alter table profiles enable row level security;
alter table employee_locations enable row level security;
alter table pos_imports enable row level security;
alter table transactions enable row level security;
alter table transaction_items enable row level security;
alter table metric_definitions enable row level security;
alter table metric_snapshots enable row level security;
alter table revenue_leaks enable row level security;
alter table challenges enable row level security;
alter table challenge_tiers enable row level security;
alter table challenge_participants enable row level security;
alter table team_goals enable row level security;
alter table daily_missions enable row level security;
alter table employee_mission_progress enable row level security;
alter table point_ledger enable row level security;
alter table xp_ledger enable row level security;
alter table employee_levels enable row level security;
alter table streaks enable row level security;
alter table badges enable row level security;
alter table employee_badges enable row level security;
alter table reward_catalog enable row level security;
alter table reward_redemptions enable row level security;
alter table notifications enable row level security;

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

create policy "org: members can view own org" on organizations
  for select using (id = current_org_id());

create policy "org: owner/admin can update own org" on organizations
  for update using (id = current_org_id() and current_role() in ('owner', 'admin'));

-- ============================================================================
-- LOCATIONS
-- ============================================================================

create policy "locations: members can view" on locations
  for select using (organization_id = current_org_id());

create policy "locations: managers can write" on locations
  for insert with check (organization_id = current_org_id() and is_manager_or_above());

create policy "locations: managers can update" on locations
  for update using (organization_id = current_org_id() and is_manager_or_above());

create policy "locations: managers can delete" on locations
  for delete using (organization_id = current_org_id() and is_manager_or_above());

-- ============================================================================
-- PROFILES
-- ============================================================================

create policy "profiles: members can view org colleagues" on profiles
  for select using (organization_id = current_org_id() or id = auth.uid());

create policy "profiles: user can insert own row" on profiles
  for insert with check (id = auth.uid());

create policy "profiles: user can update own row" on profiles
  for update using (id = auth.uid());

create policy "profiles: managers can update org profiles" on profiles
  for update using (organization_id = current_org_id() and is_manager_or_above());

-- ============================================================================
-- EMPLOYEE_LOCATIONS
-- ============================================================================

create policy "employee_locations: members can view" on employee_locations
  for select using (
    exists (
      select 1 from profiles p
      where p.id = employee_locations.employee_id
        and p.organization_id = current_org_id()
    )
  );

create policy "employee_locations: managers can write" on employee_locations
  for all using (
    is_manager_or_above()
    and exists (
      select 1 from locations l
      where l.id = employee_locations.location_id
        and l.organization_id = current_org_id()
    )
  ) with check (
    is_manager_or_above()
    and exists (
      select 1 from locations l
      where l.id = employee_locations.location_id
        and l.organization_id = current_org_id()
    )
  );

-- ============================================================================
-- POS_IMPORTS / TRANSACTIONS / TRANSACTION_ITEMS — manager+ only
-- ============================================================================

create policy "pos_imports: managers can view" on pos_imports
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "pos_imports: managers can write" on pos_imports
  for insert with check (organization_id = current_org_id() and is_manager_or_above());

create policy "pos_imports: managers can update" on pos_imports
  for update using (organization_id = current_org_id() and is_manager_or_above());

create policy "transactions: managers can view" on transactions
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "transaction_items: managers can view" on transaction_items
  for select using (organization_id = current_org_id() and is_manager_or_above());

-- Transaction/transaction_item writes happen exclusively through the
-- service-role CSV import pipeline (bypasses RLS) — no client insert policy.

-- ============================================================================
-- METRIC_DEFINITIONS — shared reference data, readable by any authenticated user
-- ============================================================================

create policy "metric_definitions: any authenticated user can view" on metric_definitions
  for select using (auth.role() = 'authenticated');

-- ============================================================================
-- METRIC_SNAPSHOTS
-- ============================================================================

create policy "metric_snapshots: managers can view org" on metric_snapshots
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "metric_snapshots: employees can view own" on metric_snapshots
  for select using (employee_id = auth.uid());

-- Writes happen via the metric-engine job (service role) — no client write policy.

-- ============================================================================
-- REVENUE_LEAKS — manager+ only
-- ============================================================================

create policy "revenue_leaks: managers can view" on revenue_leaks
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "revenue_leaks: managers can update" on revenue_leaks
  for update using (organization_id = current_org_id() and is_manager_or_above());

-- Detection (insert) happens via service role.

-- ============================================================================
-- CHALLENGES
-- ============================================================================

create policy "challenges: managers can view org" on challenges
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "challenges: employees can view at their locations" on challenges
  for select using (
    status <> 'draft'
    and exists (
      select 1 from employee_locations el
      where el.employee_id = auth.uid()
        and el.location_id = challenges.location_id
    )
  );

create policy "challenges: managers can write" on challenges
  for insert with check (organization_id = current_org_id() and is_manager_or_above());

create policy "challenges: managers can update" on challenges
  for update using (organization_id = current_org_id() and is_manager_or_above());

-- ============================================================================
-- CHALLENGE_TIERS / TEAM_GOALS — visible whenever the parent challenge is
-- ============================================================================

create policy "challenge_tiers: viewable with parent challenge" on challenge_tiers
  for select using (
    exists (select 1 from challenges c where c.id = challenge_tiers.challenge_id)
  );

create policy "challenge_tiers: managers can write" on challenge_tiers
  for all using (
    exists (
      select 1 from challenges c
      where c.id = challenge_tiers.challenge_id
        and c.organization_id = current_org_id()
        and is_manager_or_above()
    )
  ) with check (
    exists (
      select 1 from challenges c
      where c.id = challenge_tiers.challenge_id
        and c.organization_id = current_org_id()
        and is_manager_or_above()
    )
  );

create policy "team_goals: viewable with parent challenge" on team_goals
  for select using (
    exists (select 1 from challenges c where c.id = team_goals.challenge_id)
  );

create policy "team_goals: managers can write" on team_goals
  for all using (
    exists (
      select 1 from challenges c
      where c.id = team_goals.challenge_id
        and c.organization_id = current_org_id()
        and is_manager_or_above()
    )
  ) with check (
    exists (
      select 1 from challenges c
      where c.id = team_goals.challenge_id
        and c.organization_id = current_org_id()
        and is_manager_or_above()
    )
  );

-- ============================================================================
-- CHALLENGE_PARTICIPANTS — leaderboard rows: viewable by anyone who can see
-- the challenge; writes are server-side (progress engine) except managers.
-- ============================================================================

create policy "challenge_participants: viewable with parent challenge" on challenge_participants
  for select using (
    exists (select 1 from challenges c where c.id = challenge_participants.challenge_id)
  );

create policy "challenge_participants: managers can write" on challenge_participants
  for all using (
    exists (
      select 1 from challenges c
      where c.id = challenge_participants.challenge_id
        and c.organization_id = current_org_id()
        and is_manager_or_above()
    )
  ) with check (
    exists (
      select 1 from challenges c
      where c.id = challenge_participants.challenge_id
        and c.organization_id = current_org_id()
        and is_manager_or_above()
    )
  );

-- ============================================================================
-- DAILY_MISSIONS
-- ============================================================================

create policy "daily_missions: managers can view org" on daily_missions
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "daily_missions: employees can view at their locations" on daily_missions
  for select using (
    exists (
      select 1 from employee_locations el
      where el.employee_id = auth.uid()
        and el.location_id = daily_missions.location_id
    )
  );

create policy "daily_missions: managers can write" on daily_missions
  for all using (organization_id = current_org_id() and is_manager_or_above())
  with check (organization_id = current_org_id() and is_manager_or_above());

-- ============================================================================
-- EMPLOYEE_MISSION_PROGRESS
-- ============================================================================

create policy "employee_mission_progress: employees can view own" on employee_mission_progress
  for select using (employee_id = auth.uid());

create policy "employee_mission_progress: managers can view org" on employee_mission_progress
  for select using (
    exists (
      select 1 from daily_missions dm
      where dm.id = employee_mission_progress.mission_id
        and dm.organization_id = current_org_id()
        and is_manager_or_above()
    )
  );

-- Progress/reward writes happen via the missions engine (service role).

-- ============================================================================
-- POINT_LEDGER / XP_LEDGER — immutable, server-written only
-- ============================================================================

create policy "point_ledger: employees can view own" on point_ledger
  for select using (employee_id = auth.uid());

create policy "point_ledger: managers can view org" on point_ledger
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "xp_ledger: employees can view own" on xp_ledger
  for select using (employee_id = auth.uid());

create policy "xp_ledger: managers can view org" on xp_ledger
  for select using (organization_id = current_org_id() and is_manager_or_above());

-- ============================================================================
-- EMPLOYEE_LEVELS / STREAKS — org-visible (leaderboards), server-written only
-- ============================================================================

create policy "employee_levels: org members can view" on employee_levels
  for select using (
    exists (
      select 1 from profiles p
      where p.id = employee_levels.employee_id
        and p.organization_id = current_org_id()
    )
  );

create policy "streaks: org members can view" on streaks
  for select using (
    exists (
      select 1 from profiles p
      where p.id = streaks.employee_id
        and p.organization_id = current_org_id()
    )
  );

-- ============================================================================
-- BADGES / EMPLOYEE_BADGES
-- ============================================================================

create policy "badges: any authenticated user can view" on badges
  for select using (auth.role() = 'authenticated');

create policy "employee_badges: org members can view" on employee_badges
  for select using (
    exists (
      select 1 from profiles p
      where p.id = employee_badges.employee_id
        and p.organization_id = current_org_id()
    )
  );

-- ============================================================================
-- REWARD_CATALOG
-- ============================================================================

create policy "reward_catalog: global or org rewards are viewable" on reward_catalog
  for select using (organization_id is null or organization_id = current_org_id());

create policy "reward_catalog: managers can write org rewards" on reward_catalog
  for all using (organization_id = current_org_id() and is_manager_or_above())
  with check (organization_id = current_org_id() and is_manager_or_above());

-- ============================================================================
-- REWARD_REDEMPTIONS
-- ============================================================================

create policy "reward_redemptions: employees can view own" on reward_redemptions
  for select using (employee_id = auth.uid());

create policy "reward_redemptions: managers can view org" on reward_redemptions
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "reward_redemptions: managers can update status" on reward_redemptions
  for update using (organization_id = current_org_id() and is_manager_or_above());

-- Redemption creation is validated server-side (RPC checks point balance
-- before inserting) rather than via a direct client insert policy.

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

create policy "notifications: user can view own" on notifications
  for select using (user_id = auth.uid());

create policy "notifications: user can mark own read" on notifications
  for update using (user_id = auth.uid());

create policy "notifications: managers can write org notifications" on notifications
  for insert with check (organization_id = current_org_id() and is_manager_or_above());
