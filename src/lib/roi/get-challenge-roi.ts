import "server-only";

import { getAvgAttachedItemPrice } from "@/lib/revenue-leaks/avg-item-price";
import { extrapolateEligiblePerMonth } from "@/lib/revenue-leaks/opportunity";
import { computeActualImpact, computeRewardRoi } from "./compute-roi";
import type { DetectorMetricCode } from "@/lib/metrics/types";
import type { AttachmentMetricCode } from "@/lib/metrics/category-rules";
import type { createServiceRoleClient, createClient } from "@/lib/supabase/server";

/** Either Supabase client this app uses — see the same union in
 * `revenue-leaks/avg-item-price.ts`, which this module also calls into. */
type Client = ReturnType<typeof createServiceRoleClient> | Awaited<ReturnType<typeof createClient>>;

export interface ChallengeRoiInput {
  id: string;
  organizationId: string;
  locationId: string;
  metricCode: DetectorMetricCode;
  baselineValue: number;
}

export interface ChallengeRoiReport {
  /** false when no location-level metric_snapshot exists at all for this
   * location/metric (a challenge that completed by end_date passing with
   * no real POS data ever imported) — everything else is 0 in that case,
   * not a fabricated number. */
  dataAvailable: boolean;
  metricCode: DetectorMetricCode;
  beforeValue: number;
  afterValue: number;
  actualGap: number;
  actualIncrementalRevenue: number;
  actualContributionProfit: number;
  actualRewardCost: number;
  rewardRoi: number;
}

/**
 * Real "before/after challenge measurement" (spec's Phase 9 build order),
 * for one already-`completed` challenge — shared by `src/lib/data/manager.ts`'s
 * single-challenge ROI report and its org-wide `getOpportunitySummary`
 * aggregate, so both read the same number the same way.
 *
 * `beforeValue` is the location-level baseline captured at launch
 * (`challenges.baseline_value`, real since Phase 7); `afterValue` is the
 * location-level `metric_snapshot` the metric engine most recently
 * computed for this location/metric — the same "current" value the leak
 * detector and a challenge's team-goal tracking already read, just
 * interpreted here as "where the metric ended up" rather than "where it
 * currently sits." Reward cost is every `point_ledger` row this specific
 * challenge's tiers or team goal actually paid out (real dollar amounts,
 * not the challenge's `reward_budget` estimate from launch).
 */
export async function computeChallengeRoi(supabase: Client, input: ChallengeRoiInput): Promise<ChallengeRoiReport> {
  const [{ data: snapshot, error: snapshotError }, actualRewardCost] = await Promise.all([
    supabase
      .from("metric_snapshots")
      .select("value, denominator, period_start, period_end")
      .eq("organization_id", input.organizationId)
      .eq("location_id", input.locationId)
      .is("employee_id", null)
      .eq("metric_code", input.metricCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getActualRewardCost(supabase, input.organizationId, input.id),
  ]);
  if (snapshotError) throw snapshotError;

  if (!snapshot) {
    return {
      dataAvailable: false,
      metricCode: input.metricCode,
      beforeValue: input.baselineValue,
      afterValue: 0,
      actualGap: 0,
      actualIncrementalRevenue: 0,
      actualContributionProfit: 0,
      actualRewardCost,
      rewardRoi: 0,
    };
  }

  const avgAttachedItemPrice =
    input.metricCode === "average_ticket"
      ? 0
      : await getAvgAttachedItemPrice(
          supabase,
          input.organizationId,
          input.locationId,
          input.metricCode as AttachmentMetricCode,
        );

  const eligibleTransactionsPerMonth = extrapolateEligiblePerMonth(
    snapshot.denominator,
    snapshot.period_start,
    snapshot.period_end,
  );

  const impact = computeActualImpact({
    metricCode: input.metricCode,
    beforeValue: input.baselineValue,
    afterValue: snapshot.value,
    eligibleTransactionsPerMonth,
    avgAttachedItemPrice,
  });

  return {
    dataAvailable: true,
    metricCode: input.metricCode,
    beforeValue: input.baselineValue,
    afterValue: snapshot.value,
    actualGap: impact.actualGap,
    actualIncrementalRevenue: impact.actualIncrementalRevenue,
    actualContributionProfit: impact.actualContributionProfit,
    actualRewardCost,
    rewardRoi: computeRewardRoi(impact.actualContributionProfit, actualRewardCost),
  };
}

/** Sum of every `point_ledger` dollar amount this challenge's tiers or
 * team goal actually paid out — real cost, not the launch-time budget. */
async function getActualRewardCost(supabase: Client, organizationId: string, challengeId: string): Promise<number> {
  const [{ data: tiers, error: tiersError }, { data: teamGoal, error: teamGoalError }] = await Promise.all([
    supabase.from("challenge_tiers").select("id").eq("challenge_id", challengeId),
    supabase.from("team_goals").select("id").eq("challenge_id", challengeId).maybeSingle(),
  ]);
  if (tiersError) throw tiersError;
  if (teamGoalError) throw teamGoalError;

  const tierIds = (tiers ?? []).map((t) => t.id);
  let cost = 0;

  if (tierIds.length > 0) {
    const { data, error } = await supabase
      .from("point_ledger")
      .select("dollar_value")
      .eq("organization_id", organizationId)
      .eq("source_type", "challenge_tier")
      .in("source_id", tierIds);
    if (error) throw error;
    cost += (data ?? []).reduce((sum, r) => sum + r.dollar_value, 0);
  }

  if (teamGoal) {
    const { data, error } = await supabase
      .from("point_ledger")
      .select("dollar_value")
      .eq("organization_id", organizationId)
      .eq("source_type", "team_goal")
      .eq("source_id", teamGoal.id);
    if (error) throw error;
    cost += (data ?? []).reduce((sum, r) => sum + r.dollar_value, 0);
  }

  return cost;
}
