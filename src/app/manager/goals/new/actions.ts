"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { scaleOpportunityToTarget } from "@/lib/challenges/recommendations";

export interface LaunchChallengeInput {
  leakId: string;
  title: string;
  description: string;
  targetValue: number;
  durationDays: number;
  rewardBudget: number;
  tiers: Array<{ name: string; thresholdValue: number; pointsAwarded: number }>;
  teamGoal: { targetValue: number; pointsAwardedPerEmployee: number } | null;
}

export async function launchChallenge(
  input: LaunchChallengeInput,
): Promise<{ challengeId: string } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id || !isManagerRole(profile.role)) {
    return { error: "You don't have permission to launch a challenge." };
  }

  if (input.tiers.length === 0) {
    return { error: "Add at least one reward tier." };
  }

  const organizationId = profile.organization_id;
  const supabase = await createClient();

  // Re-derive everything from the leak row itself — never trust
  // location/metric/financials supplied by the client for a server write.
  const { data: leak, error: leakError } = await supabase
    .from("revenue_leaks")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", input.leakId)
    .maybeSingle();

  if (leakError) return { error: leakError.message };
  if (!leak) return { error: "That revenue leak couldn't be found." };

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("active")
    .eq("id", leak.location_id)
    .maybeSingle();
  if (locationError) return { error: locationError.message };
  if (location && !location.active) {
    return { error: "This leak's location is inactive — reactivate it in Settings before launching a challenge." };
  }

  const { data: existingChallenge, error: existingError } = await supabase
    .from("challenges")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("revenue_leak_id", leak.id)
    .maybeSingle();

  if (existingError) return { error: existingError.message };
  if (existingChallenge) return { challengeId: existingChallenge.id };

  const { data: employeeLinks, error: linkError } = await supabase
    .from("employee_locations")
    .select("employee_id")
    .eq("location_id", leak.location_id);

  if (linkError) return { error: linkError.message };
  const employeeIds = Array.from(new Set((employeeLinks ?? []).map((l) => l.employee_id)));

  if (employeeIds.length === 0) {
    return { error: "No employees are assigned to this location yet — add employees before launching a challenge." };
  }

  // Prefer each employee's own latest metric_snapshot as their baseline —
  // real per-employee data once a CSV import has produced one. Falls back
  // to the leak's location-level current_value for anyone without one yet
  // (a brand-new employee, or before any POS data has been imported).
  const { data: employeeSnapshots, error: snapshotsError } = await supabase
    .from("metric_snapshots")
    .select("employee_id, value, created_at")
    .eq("organization_id", organizationId)
    .eq("location_id", leak.location_id)
    .eq("metric_code", leak.metric_code)
    .in("employee_id", employeeIds)
    .order("created_at", { ascending: false });
  if (snapshotsError) return { error: snapshotsError.message };

  const baselineByEmployee = new Map<string, number>();
  for (const s of employeeSnapshots ?? []) {
    if (!s.employee_id || baselineByEmployee.has(s.employee_id)) continue;
    baselineByEmployee.set(s.employee_id, s.value);
  }

  const projected = scaleOpportunityToTarget(
    leak.estimated_incremental_revenue,
    leak.estimated_contribution_profit,
    leak.current_value,
    leak.benchmark_value,
    input.targetValue,
  );

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + input.durationDays);

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .insert({
      organization_id: organizationId,
      location_id: leak.location_id,
      revenue_leak_id: leak.id,
      title: input.title,
      description: input.description || null,
      metric_code: leak.metric_code,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      baseline_value: leak.current_value,
      target_value: input.targetValue,
      projected_incremental_revenue: projected.revenue,
      projected_contribution_profit: projected.profit,
      reward_budget: input.rewardBudget,
      status: "active",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (challengeError) return { error: challengeError.message };
  const challengeId = challenge.id;

  const { error: tiersError } = await supabase.from("challenge_tiers").insert(
    input.tiers.map((tier, i) => ({
      challenge_id: challengeId,
      name: tier.name,
      threshold_value: tier.thresholdValue,
      points_awarded: tier.pointsAwarded,
      rank_order: i + 1,
    })),
  );
  if (tiersError) return { error: tiersError.message };

  if (input.teamGoal) {
    const { error: teamGoalError } = await supabase.from("team_goals").insert({
      challenge_id: challengeId,
      location_id: leak.location_id,
      target_value: input.teamGoal.targetValue,
      current_value: leak.current_value,
      points_awarded_per_employee: input.teamGoal.pointsAwardedPerEmployee,
      completed: false,
    });
    if (teamGoalError) return { error: teamGoalError.message };
  }

  const { error: participantsError } = await supabase.from("challenge_participants").insert(
    employeeIds.map((employeeId) => {
      const baseline = baselineByEmployee.get(employeeId) ?? leak.current_value;
      return {
        challenge_id: challengeId,
        employee_id: employeeId,
        baseline_value: baseline,
        current_value: baseline,
        best_value: baseline,
        points_earned: 0,
        completed: false,
      };
    }),
  );
  if (participantsError) return { error: participantsError.message };

  const { error: notificationsError } = await supabase.from("notifications").insert(
    employeeIds.map((employeeId) => ({
      organization_id: organizationId,
      user_id: employeeId,
      type: "new_challenge" as const,
      title: `${input.title} just dropped.`,
      body: input.description || "A new challenge is live — check the app for your goal and reward tiers.",
      link: "/employee",
    })),
  );
  if (notificationsError) return { error: notificationsError.message };

  const { error: leakUpdateError } = await supabase
    .from("revenue_leaks")
    .update({ status: "challenge_created" })
    .eq("id", leak.id)
    .eq("organization_id", organizationId);
  if (leakUpdateError) return { error: leakUpdateError.message };

  return { challengeId };
}
