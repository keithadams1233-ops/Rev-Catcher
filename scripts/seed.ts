/**
 * Demo seed for ABC Restaurant Holdings.
 *
 * Phase 1 seeded just enough to prove auth/RLS/routing worked (org, two
 * locations, one manager, one employee). Phase 2 (Manager UI) needs real
 * rows to render against, so this expands that into: five locations, a
 * detected-leak set that reproduces the spec's headline demo numbers
 * ($47,820 / $28,340 / 17 leaks), and the "Beverage Boost" challenge
 * launched from the Store #37 leak with a 7-person leaderboard (Sarah
 * Jones lands at rank 4, matching spec §20).
 *
 * What this intentionally does NOT seed yet: 90 days of raw transactions,
 * 267 employees, or Sarah's full Rev Rewards stats (points/XP/level/
 * streak) — those numbers are only meaningful once the metric engine
 * (Phase 4) and gamification engine (Phase 8) exist to produce/consume
 * them. Seeding a "Points: 8,450" balance now with no ledger rows behind
 * it would just be a number nothing computed.
 *
 * Safe to re-run — every insert is guarded by an existence check.
 *
 * Usage:
 *   npm run seed
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — see .env.example.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_NAME = "ABC Restaurant Holdings";
const DEMO_PASSWORD = "RevCatcher123!";
const LOCATION_NAMES = ["Store #37", "Store #52", "Store #88", "Store #101", "Store #102"];

const MANAGER = {
  email: "manager@revcatcher.demo",
  role: "owner" as const,
  first_name: "Morgan",
  last_name: "Diaz",
};

// The seven employees who work Store #37 and participate in Beverage Boost.
// current_value is their live beverage-attachment rate for the challenge;
// rank is derived from it (highest first) — Sarah lands at rank 4, per spec.
const PARTICIPANTS = [
  { email: "kevin@revcatcher.demo", first: "Kevin", last: "Ng", baseline: 0.3, current: 0.412 },
  { email: "ana@revcatcher.demo", first: "Ana", last: "Reyes", baseline: 0.28, current: 0.395 },
  { email: "diego@revcatcher.demo", first: "Diego", last: "Alvarez", baseline: 0.27, current: 0.362 },
  { email: "sarah@revcatcher.demo", first: "Sarah", last: "Jones", baseline: 0.26, current: 0.338 },
  { email: "priya@revcatcher.demo", first: "Priya", last: "Nair", baseline: 0.24, current: 0.31 },
  { email: "marcus@revcatcher.demo", first: "Marcus", last: "Webb", baseline: 0.23, current: 0.295 },
  { email: "jamal@revcatcher.demo", first: "Jamal", last: "Carter", baseline: 0.22, current: 0.27 },
].sort((a, b) => b.current - a.current);

// 16 supporting leaks + the 1 flagship Store #37 beverage leak below sum to
// exactly the spec's $47,820 revenue / $28,340 contribution-profit / 17-leak
// totals (spot-checked with a small script, then hand-copied here).
const SUPPORTING_LEAKS: Array<{
  location: string;
  metricCode: string;
  currentValue: number;
  benchmarkValue: number;
  revenue: number;
  profit: number;
  confidence: number;
}> = [
  { location: "Store #37", metricCode: "addon_attachment", currentValue: 0.249, benchmarkValue: 0.359, revenue: 1600, profit: 1040, confidence: 0.82 },
  { location: "Store #37", metricCode: "dessert_attachment", currentValue: 0.254, benchmarkValue: 0.35, revenue: 2080, profit: 1414, confidence: 0.55 },
  { location: "Store #37", metricCode: "premium_upgrade_rate", currentValue: 0.26, benchmarkValue: 0.341, revenue: 2560, profit: 1536, confidence: 0.55 },
  { location: "Store #52", metricCode: "average_ticket", currentValue: 13.33, benchmarkValue: 14.01, revenue: 3040, profit: 1672, confidence: 0.32 },
  { location: "Store #52", metricCode: "loyalty_enrollment", currentValue: 0.271, benchmarkValue: 0.412, revenue: 3520, profit: 1760, confidence: 0.82 },
  { location: "Store #52", metricCode: "beverage_attachment", currentValue: 0.277, benchmarkValue: 0.404, revenue: 1600, profit: 1120, confidence: 0.55 },
  { location: "Store #52", metricCode: "addon_attachment", currentValue: 0.282, benchmarkValue: 0.394, revenue: 2080, profit: 1352, confidence: 0.55 },
  { location: "Store #88", metricCode: "dessert_attachment", currentValue: 0.288, benchmarkValue: 0.385, revenue: 2560, profit: 1741, confidence: 0.32 },
  { location: "Store #88", metricCode: "premium_upgrade_rate", currentValue: 0.293, benchmarkValue: 0.375, revenue: 3040, profit: 1824, confidence: 0.82 },
  { location: "Store #88", metricCode: "average_ticket", currentValue: 14.05, benchmarkValue: 14.75, revenue: 3520, profit: 1936, confidence: 0.55 },
  { location: "Store #101", metricCode: "loyalty_enrollment", currentValue: 0.304, benchmarkValue: 0.447, revenue: 1600, profit: 800, confidence: 0.55 },
  { location: "Store #101", metricCode: "beverage_attachment", currentValue: 0.31, benchmarkValue: 0.438, revenue: 2080, profit: 1456, confidence: 0.32 },
  { location: "Store #101", metricCode: "addon_attachment", currentValue: 0.316, benchmarkValue: 0.429, revenue: 2560, profit: 1664, confidence: 0.82 },
  { location: "Store #102", metricCode: "dessert_attachment", currentValue: 0.181, benchmarkValue: 0.279, revenue: 3040, profit: 2067, confidence: 0.55 },
  { location: "Store #102", metricCode: "premium_upgrade_rate", currentValue: 0.187, benchmarkValue: 0.271, revenue: 3520, profit: 2112, confidence: 0.55 },
  { location: "Store #102", metricCode: "average_ticket", currentValue: 11.77, benchmarkValue: 12.49, revenue: 1620, profit: 646, confidence: 0.32 },
];

const FLAGSHIP_LEAK = {
  location: "Store #37",
  metricCode: "beverage_attachment",
  currentValue: 0.281,
  benchmarkValue: 0.42,
  revenue: 7800,
  profit: 4200,
  confidence: 0.82,
};

const CHALLENGE_TIERS = [
  { name: "Level 1", thresholdValue: 0.32, pointsAwarded: 500, rankOrder: 1 },
  { name: "Level 2", thresholdValue: 0.36, pointsAwarded: 1000, rankOrder: 2 },
  { name: "Level 3", thresholdValue: 0.42, pointsAwarded: 2500, rankOrder: 3 },
];

async function main() {
  console.log(`Seeding "${ORG_NAME}"...`);

  const organizationId = await ensureOrganization();
  const locationIds = await ensureLocations(organizationId);
  const managerId = await ensureAuthUser(MANAGER, organizationId);

  const employeeIds: Record<string, string> = {};
  for (const p of PARTICIPANTS) {
    const id = await ensureAuthUser(
      { email: p.email, role: "employee", first_name: p.first, last_name: p.last },
      organizationId,
    );
    employeeIds[p.email] = id;
    await ensureEmployeeLocation(id, locationIds["Store #37"], true);
  }

  const flagshipLeakId = await ensureFlagshipLeak(organizationId, locationIds, FLAGSHIP_LEAK);
  await ensureSupportingLeaks(organizationId, locationIds, SUPPORTING_LEAKS);

  await ensureChallenge(
    organizationId,
    locationIds["Store #37"],
    flagshipLeakId,
    managerId,
    employeeIds,
  );

  console.log("\nSeed complete. Demo accounts (password for all: %s):", DEMO_PASSWORD);
  console.log(`  ${"owner".padEnd(8)} ${MANAGER.email}`);
  for (const p of PARTICIPANTS) {
    console.log(`  ${"employee".padEnd(8)} ${p.email}`);
  }
}

async function ensureOrganization(): Promise<string> {
  const { data: existing, error: selectError } = await admin
    .from("organizations")
    .select("id")
    .eq("name", ORG_NAME)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) {
    console.log(`  organization already exists (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await admin
    .from("organizations")
    .insert({ name: ORG_NAME, timezone: "America/New_York" })
    .select("id")
    .single();

  if (error) throw error;
  console.log(`  created organization ${data.id}`);
  return data.id;
}

async function ensureLocations(organizationId: string): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};

  for (const name of LOCATION_NAMES) {
    const { data: existing, error: selectError } = await admin
      .from("locations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      ids[name] = existing.id;
      continue;
    }

    const { data, error } = await admin
      .from("locations")
      .insert({ organization_id: organizationId, name, timezone: "America/New_York" })
      .select("id")
      .single();

    if (error) throw error;
    console.log(`  created location "${name}" (${data.id})`);
    ids[name] = data.id;
  }

  return ids;
}

async function ensureAuthUser(
  user: { email: string; role: "owner" | "admin" | "manager" | "employee"; first_name: string; last_name: string },
  organizationId: string,
): Promise<string> {
  const { data: existingProfile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (profileError) throw profileError;
  if (existingProfile) return existingProfile.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      organization_id: organizationId,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
    },
  });

  if (error) throw error;
  console.log(`  created ${user.role} account ${user.email} (${data.user.id})`);
  return data.user.id;
}

async function ensureEmployeeLocation(employeeId: string, locationId: string, primary: boolean) {
  const { data: existing, error: selectError } = await admin
    .from("employee_locations")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return;

  const { error } = await admin
    .from("employee_locations")
    .insert({ employee_id: employeeId, location_id: locationId, primary_location: primary });

  if (error) throw error;
}

async function ensureFlagshipLeak(
  organizationId: string,
  locationIds: Record<string, string>,
  leak: typeof FLAGSHIP_LEAK,
): Promise<string> {
  const locationId = locationIds[leak.location];

  const { data: existing, error: selectError } = await admin
    .from("revenue_leaks")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("metric_code", leak.metricCode)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data, error } = await admin
    .from("revenue_leaks")
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      metric_code: leak.metricCode,
      current_value: leak.currentValue,
      benchmark_value: leak.benchmarkValue,
      gap: +(leak.benchmarkValue - leak.currentValue).toFixed(6),
      estimated_incremental_revenue: leak.revenue,
      estimated_contribution_profit: leak.profit,
      confidence_score: leak.confidence,
      status: "challenge_created",
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log(`  created flagship leak "${leak.location} / ${leak.metricCode}" (${data.id})`);
  return data.id;
}

async function ensureSupportingLeaks(
  organizationId: string,
  locationIds: Record<string, string>,
  leaks: typeof SUPPORTING_LEAKS,
) {
  for (const leak of leaks) {
    const locationId = locationIds[leak.location];

    const { data: existing, error: selectError } = await admin
      .from("revenue_leaks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .eq("metric_code", leak.metricCode)
      .maybeSingle();

    if (selectError) throw selectError;
    if (existing) continue;

    const { error } = await admin.from("revenue_leaks").insert({
      organization_id: organizationId,
      location_id: locationId,
      metric_code: leak.metricCode,
      current_value: leak.currentValue,
      benchmark_value: leak.benchmarkValue,
      gap: +(leak.benchmarkValue - leak.currentValue).toFixed(6),
      estimated_incremental_revenue: leak.revenue,
      estimated_contribution_profit: leak.profit,
      confidence_score: leak.confidence,
      status: "open",
    });

    if (error) throw error;
  }

  console.log(`  ensured ${leaks.length} supporting leaks`);
}

async function ensureChallenge(
  organizationId: string,
  store37Id: string,
  flagshipLeakId: string,
  managerId: string,
  employeeIds: Record<string, string>,
) {
  const title = "Beverage Boost";

  const { data: existing, error: selectError } = await admin
    .from("challenges")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("title", title)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) {
    console.log(`  challenge "${title}" already exists (${existing.id})`);
    return existing.id;
  }

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  const { data: challenge, error } = await admin
    .from("challenges")
    .insert({
      organization_id: organizationId,
      location_id: store37Id,
      revenue_leak_id: flagshipLeakId,
      title,
      description:
        "When an eligible customer orders food, offer them a beverage. Get Store #37's attachment rate from 28% to 36% over the next two weeks.",
      metric_code: "beverage_attachment",
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      baseline_value: 0.281,
      target_value: 0.36,
      projected_incremental_revenue: 4430,
      projected_contribution_profit: 2386,
      reward_budget: 630,
      status: "active",
      created_by: managerId,
    })
    .select("id")
    .single();

  if (error) throw error;
  const challengeId = challenge.id;
  console.log(`  created challenge "${title}" (${challengeId})`);

  for (const tier of CHALLENGE_TIERS) {
    const { error: tierError } = await admin.from("challenge_tiers").insert({
      challenge_id: challengeId,
      name: tier.name,
      threshold_value: tier.thresholdValue,
      points_awarded: tier.pointsAwarded,
      rank_order: tier.rankOrder,
    });
    if (tierError) throw tierError;
  }

  const { data: tierRows, error: tierSelectError } = await admin
    .from("challenge_tiers")
    .select("id, threshold_value, points_awarded")
    .eq("challenge_id", challengeId)
    .order("rank_order", { ascending: true });
  if (tierSelectError) throw tierSelectError;

  const { error: teamGoalError } = await admin.from("team_goals").insert({
    challenge_id: challengeId,
    location_id: store37Id,
    target_value: 0.4,
    current_value: 0.364,
    points_awarded_per_employee: 750,
    completed: false,
  });
  if (teamGoalError) throw teamGoalError;

  const ranked = [...PARTICIPANTS].sort((a, b) => b.current - a.current);

  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    const employeeId = employeeIds[p.email];
    const rank = i + 1;
    const tiersCrossed = tierRows.filter((t) => p.current >= t.threshold_value);
    const pointsEarned = tiersCrossed.reduce((sum, t) => sum + t.points_awarded, 0);
    const completed = tiersCrossed.length === tierRows.length;

    const { error: participantError } = await admin.from("challenge_participants").insert({
      challenge_id: challengeId,
      employee_id: employeeId,
      baseline_value: p.baseline,
      current_value: p.current,
      best_value: p.current,
      points_earned: pointsEarned,
      rank,
      completed,
    });
    if (participantError) throw participantError;

    for (const tier of tiersCrossed) {
      const { error: ledgerError } = await admin.from("point_ledger").insert({
        organization_id: organizationId,
        employee_id: employeeId,
        transaction_type: "earn",
        source_type: "challenge_tier",
        source_id: tier.id,
        points: tier.points_awarded,
        dollar_value: +(tier.points_awarded / 100).toFixed(2),
        description: `${title} — ${tier.threshold_value * 100}% tier reached`,
      });
      if (ledgerError) throw ledgerError;
    }

    const { error: notificationError } = await admin.from("notifications").insert({
      organization_id: organizationId,
      user_id: employeeId,
      type: "new_challenge",
      title: "Beverage Boost just dropped.",
      body: "Offer a beverage with every eligible order. Hit 36% attachment to unlock your next reward tier.",
      link: "/employee",
    });
    if (notificationError) throw notificationError;
  }

  console.log(`  seeded ${ranked.length} challenge participants, tiers, team goal, and notifications`);
  return challengeId;
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
