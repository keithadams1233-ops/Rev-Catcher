import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";

/**
 * Server-only read layer for the manager (Rev Catcher) screens. Every
 * function takes the caller's `organizationId` (always sourced from their
 * own profile server-side — never from client input) and filters on it
 * explicitly, on top of RLS, per CLAUDE.md rule #1.
 *
 * Deliberately plain: two queries + an in-memory zip instead of PostgREST
 * embedded-resource selects. Our hand-written Database type doesn't carry
 * real `Relationships` metadata (see src/lib/types/database.ts), so
 * embedded selects can't be type-checked reliably against it — at this
 * data volume (tens of leaks/challenges, not thousands) the extra
 * round-trip costs nothing and keeps every function's types honest.
 */

export interface LeakListItem {
  id: string;
  locationId: string;
  locationName: string;
  metricCode: string;
  currentValue: number;
  benchmarkValue: number;
  gap: number;
  estimatedIncrementalRevenue: number;
  estimatedContributionProfit: number;
  confidenceScore: number;
  status: Tables<"revenue_leaks">["status"];
  detectedAt: string;
}

function toLeakListItem(
  leak: Tables<"revenue_leaks">,
  locationName: string,
): LeakListItem {
  return {
    id: leak.id,
    locationId: leak.location_id,
    locationName,
    metricCode: leak.metric_code,
    currentValue: leak.current_value,
    benchmarkValue: leak.benchmark_value,
    gap: leak.gap,
    estimatedIncrementalRevenue: leak.estimated_incremental_revenue,
    estimatedContributionProfit: leak.estimated_contribution_profit,
    confidenceScore: leak.confidence_score,
    status: leak.status,
    detectedAt: leak.detected_at,
  };
}

async function locationNameMap(organizationId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .eq("organization_id", organizationId);

  if (error) throw error;
  return new Map((data ?? []).map((l) => [l.id, l.name]));
}

export interface OpportunitySummary {
  totalRevenueOpportunity: number;
  totalContributionProfit: number;
  openLeakCount: number;
  activeChallengeCount: number;
  /** null until a challenge has completed — Phase 9 (ROI report) computes this for real. */
  recoveredContributionProfit: number | null;
  /** null until a challenge has completed. */
  rewardRoi: number | null;
}

export async function getOpportunitySummary(organizationId: string): Promise<OpportunitySummary> {
  const supabase = await createClient();

  const [{ data: leaks, error: leakError }, { data: activeChallenges, error: activeError }, { data: completedChallenges, error: completedError }] =
    await Promise.all([
      supabase
        .from("revenue_leaks")
        .select("estimated_incremental_revenue, estimated_contribution_profit")
        .eq("organization_id", organizationId)
        .in("status", ["open", "challenge_created"]),
      supabase
        .from("challenges")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("challenges")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("status", "completed"),
    ]);

  if (leakError) throw leakError;
  if (activeError) throw activeError;
  if (completedError) throw completedError;

  const totalRevenueOpportunity = (leaks ?? []).reduce(
    (sum, l) => sum + l.estimated_incremental_revenue,
    0,
  );
  const totalContributionProfit = (leaks ?? []).reduce(
    (sum, l) => sum + l.estimated_contribution_profit,
    0,
  );

  return {
    totalRevenueOpportunity,
    totalContributionProfit,
    openLeakCount: leaks?.length ?? 0,
    activeChallengeCount: activeChallenges?.length ?? 0,
    // Phase 9 computes this from before/after metric snapshots once a
    // challenge actually completes — no completed challenges exist yet.
    recoveredContributionProfit: (completedChallenges?.length ?? 0) > 0 ? 0 : null,
    rewardRoi: (completedChallenges?.length ?? 0) > 0 ? 0 : null,
  };
}

export async function listLeaks(organizationId: string): Promise<LeakListItem[]> {
  const supabase = await createClient();
  const [{ data: leaks, error }, locationNames] = await Promise.all([
    supabase
      .from("revenue_leaks")
      .select("*")
      .eq("organization_id", organizationId)
      .neq("status", "dismissed")
      .order("estimated_contribution_profit", { ascending: false }),
    locationNameMap(organizationId),
  ]);

  if (error) throw error;
  return (leaks ?? []).map((l) => toLeakListItem(l, locationNames.get(l.location_id) ?? "Unknown location"));
}

export async function getTopLeaks(organizationId: string, limit: number): Promise<LeakListItem[]> {
  const all = await listLeaks(organizationId);
  return all.slice(0, limit);
}

export interface LeakDetail extends LeakListItem {
  metricName: string;
  metricDescription: string | null;
  associatedChallengeId: string | null;
}

export async function getLeak(organizationId: string, leakId: string): Promise<LeakDetail | null> {
  const supabase = await createClient();

  const { data: leak, error } = await supabase
    .from("revenue_leaks")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", leakId)
    .maybeSingle();

  if (error) throw error;
  if (!leak) return null;

  const [{ data: location, error: locError }, { data: metricDef, error: metricError }, { data: challenge, error: challengeError }] =
    await Promise.all([
      supabase.from("locations").select("name").eq("id", leak.location_id).maybeSingle(),
      supabase
        .from("metric_definitions")
        .select("name, description")
        .eq("code", leak.metric_code)
        .maybeSingle(),
      supabase
        .from("challenges")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("revenue_leak_id", leakId)
        .maybeSingle(),
    ]);

  if (locError) throw locError;
  if (metricError) throw metricError;
  if (challengeError) throw challengeError;

  return {
    ...toLeakListItem(leak, location?.name ?? "Unknown location"),
    metricName: metricDef?.name ?? leak.metric_code,
    metricDescription: metricDef?.description ?? null,
    associatedChallengeId: challenge?.id ?? null,
  };
}

export interface LocationSummary {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  active: boolean;
}

export async function listLocations(organizationId: string): Promise<LocationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, address, timezone, active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    timezone: l.timezone,
    active: l.active,
  }));
}

export interface ChallengeListItem {
  id: string;
  title: string;
  status: Tables<"challenges">["status"];
  locationName: string;
  metricCode: string;
  startDate: string;
  endDate: string;
  baselineValue: number;
  targetValue: number;
  rewardBudget: number;
  participantCount: number;
}

export async function listChallenges(organizationId: string): Promise<ChallengeListItem[]> {
  const supabase = await createClient();
  const [{ data: challenges, error }, locationNames] = await Promise.all([
    supabase
      .from("challenges")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    locationNameMap(organizationId),
  ]);

  if (error) throw error;
  if (!challenges || challenges.length === 0) return [];

  const { data: participants, error: pError } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .in(
      "challenge_id",
      challenges.map((c) => c.id),
    );

  if (pError) throw pError;

  const counts = new Map<string, number>();
  for (const p of participants ?? []) {
    counts.set(p.challenge_id, (counts.get(p.challenge_id) ?? 0) + 1);
  }

  return challenges.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    locationName: locationNames.get(c.location_id) ?? "Unknown location",
    metricCode: c.metric_code,
    startDate: c.start_date,
    endDate: c.end_date,
    baselineValue: c.baseline_value,
    targetValue: c.target_value,
    rewardBudget: c.reward_budget,
    participantCount: counts.get(c.id) ?? 0,
  }));
}

export interface ChallengeParticipantDetail {
  employeeId: string;
  employeeName: string;
  baselineValue: number;
  currentValue: number;
  bestValue: number;
  pointsEarned: number;
  rank: number | null;
  completed: boolean;
}

export interface ChallengeDetail {
  id: string;
  title: string;
  description: string | null;
  status: Tables<"challenges">["status"];
  locationId: string;
  locationName: string;
  metricCode: string;
  startDate: string;
  endDate: string;
  baselineValue: number;
  targetValue: number;
  projectedIncrementalRevenue: number;
  projectedContributionProfit: number;
  rewardBudget: number;
  revenueLeakId: string | null;
  tiers: Array<{ id: string; name: string; thresholdValue: number; pointsAwarded: number; rankOrder: number }>;
  teamGoal: { targetValue: number; currentValue: number; pointsAwardedPerEmployee: number; completed: boolean } | null;
  participants: ChallengeParticipantDetail[];
}

export async function getChallenge(organizationId: string, challengeId: string): Promise<ChallengeDetail | null> {
  const supabase = await createClient();

  const { data: challenge, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", challengeId)
    .maybeSingle();

  if (error) throw error;
  if (!challenge) return null;

  const [
    { data: location, error: locError },
    { data: tiers, error: tierError },
    { data: teamGoal, error: teamGoalError },
    { data: participants, error: participantError },
  ] = await Promise.all([
    supabase.from("locations").select("name").eq("id", challenge.location_id).maybeSingle(),
    supabase
      .from("challenge_tiers")
      .select("*")
      .eq("challenge_id", challengeId)
      .order("rank_order", { ascending: true }),
    supabase.from("team_goals").select("*").eq("challenge_id", challengeId).maybeSingle(),
    supabase
      .from("challenge_participants")
      .select("*")
      .eq("challenge_id", challengeId)
      .order("rank", { ascending: true, nullsFirst: false }),
  ]);

  if (locError) throw locError;
  if (tierError) throw tierError;
  if (teamGoalError) throw teamGoalError;
  if (participantError) throw participantError;

  const employeeIds = (participants ?? []).map((p) => p.employee_id);
  let names = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", employeeIds);
    if (profileError) throw profileError;
    names = new Map(
      (profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim() || p.email]),
    );
  }

  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    status: challenge.status,
    locationId: challenge.location_id,
    locationName: location?.name ?? "Unknown location",
    metricCode: challenge.metric_code,
    startDate: challenge.start_date,
    endDate: challenge.end_date,
    baselineValue: challenge.baseline_value,
    targetValue: challenge.target_value,
    projectedIncrementalRevenue: challenge.projected_incremental_revenue,
    projectedContributionProfit: challenge.projected_contribution_profit,
    rewardBudget: challenge.reward_budget,
    revenueLeakId: challenge.revenue_leak_id,
    tiers: (tiers ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      thresholdValue: t.threshold_value,
      pointsAwarded: t.points_awarded,
      rankOrder: t.rank_order,
    })),
    teamGoal: teamGoal
      ? {
          targetValue: teamGoal.target_value,
          currentValue: teamGoal.current_value,
          pointsAwardedPerEmployee: teamGoal.points_awarded_per_employee,
          completed: teamGoal.completed,
        }
      : null,
    participants: (participants ?? []).map((p) => ({
      employeeId: p.employee_id,
      employeeName: names.get(p.employee_id) ?? "Unknown employee",
      baselineValue: p.baseline_value,
      currentValue: p.current_value,
      bestValue: p.best_value,
      pointsEarned: p.points_earned,
      rank: p.rank,
      completed: p.completed,
    })),
  };
}

export interface EmployeeRosterItem {
  id: string;
  name: string;
  email: string;
  role: Tables<"profiles">["role"];
  active: boolean;
  locationNames: string[];
}

export async function listEmployeeRoster(organizationId: string): Promise<EmployeeRosterItem[]> {
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, active")
    .eq("organization_id", organizationId)
    .order("first_name", { ascending: true });

  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  const [{ data: empLocations, error: elError }, locationNames] = await Promise.all([
    supabase
      .from("employee_locations")
      .select("employee_id, location_id")
      .in(
        "employee_id",
        profiles.map((p) => p.id),
      ),
    locationNameMap(organizationId),
  ]);

  if (elError) throw elError;

  const locationsByEmployee = new Map<string, string[]>();
  for (const el of empLocations ?? []) {
    const name = locationNames.get(el.location_id);
    if (!name) continue;
    const list = locationsByEmployee.get(el.employee_id) ?? [];
    list.push(name);
    locationsByEmployee.set(el.employee_id, list);
  }

  return profiles.map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim() || p.email,
    email: p.email,
    role: p.role,
    active: p.active,
    locationNames: locationsByEmployee.get(p.id) ?? [],
  }));
}

export interface EmployeeAtLocation {
  id: string;
  name: string;
}

/** Employees eligible to be enrolled in a challenge launched at this location. */
export async function listEmployeesAtLocation(
  organizationId: string,
  locationId: string,
): Promise<EmployeeAtLocation[]> {
  const supabase = await createClient();

  const { data: links, error: linkError } = await supabase
    .from("employee_locations")
    .select("employee_id")
    .eq("location_id", locationId);

  if (linkError) throw linkError;
  const employeeIds = (links ?? []).map((l) => l.employee_id);
  if (employeeIds.length === 0) return [];

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("organization_id", organizationId)
    .eq("role", "employee")
    .eq("active", true)
    .in("id", employeeIds);

  if (error) throw error;

  return (profiles ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim() || p.email,
  }));
}

/** True if a revenue leak already has a challenge launched from it. */
export async function leakHasChallenge(organizationId: string, leakId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("revenue_leak_id", leakId)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  timezone: string;
  subscriptionStatus: string;
  defaultPointValue: number;
}

export async function getOrganization(organizationId: string): Promise<OrganizationSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    timezone: data.timezone,
    subscriptionStatus: data.subscription_status,
    defaultPointValue: data.default_point_value,
  };
}

// Reward catalog reads live in src/lib/data/rewards.ts (shared with the
// employee Rewards screen — role-agnostic data, owned by neither module).
export { listRewardCatalog, type RewardCatalogItem } from "@/lib/data/rewards";

export interface PosImportSummary {
  id: string;
  filename: string;
  status: Tables<"pos_imports">["status"];
  importedAt: string;
  dateStart: string | null;
  dateEnd: string | null;
  rowCount: number;
  errorCount: number;
}

export async function listPosImports(organizationId: string): Promise<PosImportSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_imports")
    .select("*")
    .eq("organization_id", organizationId)
    .order("imported_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    filename: i.filename,
    status: i.status,
    importedAt: i.imported_at,
    dateStart: i.date_start,
    dateEnd: i.date_end,
    rowCount: i.row_count,
    errorCount: i.error_count,
  }));
}

export async function getSavedColumnMapping(
  organizationId: string,
): Promise<Record<string, string | null> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_column_mappings")
    .select("mapping")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data?.mapping ?? null;
}
