import { calculateOpportunity } from "@/lib/revenue-leaks/opportunity";
import { rewardRatio } from "@/lib/challenges/recommendations";
import type { DetectorMetricCode } from "@/lib/metrics/types";

/**
 * "Before/after challenge measurement" (spec's Phase 9 build order).
 * Deliberately not a new formula: it reuses `calculateOpportunity` (spec
 * §8) exactly, just fed a challenge's real before/after values instead of
 * a location's current-vs-benchmark comparison. `calculateOpportunity`'s
 * "currentValue" slot becomes `beforeValue` here and its "benchmarkValue"
 * slot becomes `afterValue`, so the gap it computes is the challenge's own
 * actual improvement — and it already zeroes out for a non-positive gap
 * (the metric didn't actually improve, or regressed) rather than
 * reporting a negative "recovery." Same reasoning CLAUDE.md rule #6 asks
 * for everywhere else: one deterministic formula, not a projected version
 * and a separate actual version that could quietly drift apart.
 */
export interface ActualImpactInput {
  metricCode: DetectorMetricCode;
  beforeValue: number;
  afterValue: number;
  /** Eligible transactions over the challenge's real period, already
   * extrapolated to a 30-day month — see
   * `revenue-leaks/opportunity.ts`'s `extrapolateEligiblePerMonth`. */
  eligibleTransactionsPerMonth: number;
  /** Unused for `average_ticket` — see `calculateOpportunity`. */
  avgAttachedItemPrice: number;
  marginOverride?: number;
}

export interface ActualImpactResult {
  /** afterValue - beforeValue — can be negative (a regression). Revenue
   * and profit below are zeroed instead of going negative in that case,
   * same as `calculateOpportunity`; `actualGap` itself is left as the
   * real signed number so a regression is still visible, not hidden. */
  actualGap: number;
  actualIncrementalRevenue: number;
  actualContributionProfit: number;
}

export function computeActualImpact(input: ActualImpactInput): ActualImpactResult {
  const opportunity = calculateOpportunity({
    metricCode: input.metricCode,
    currentValue: input.beforeValue,
    benchmarkValue: input.afterValue,
    eligibleTransactionsPerMonth: input.eligibleTransactionsPerMonth,
    avgAttachedItemPrice: input.avgAttachedItemPrice,
    marginOverride: input.marginOverride,
  });

  return {
    actualGap: opportunity.gap,
    actualIncrementalRevenue: opportunity.estimatedIncrementalRevenue,
    actualContributionProfit: opportunity.estimatedContributionProfit,
  };
}

/**
 * Reward ROI: actual recovered profit per dollar actually paid out in
 * rewards for a challenge (tier + team-goal point_ledger awards, at the
 * app's standard 100-points-per-dollar rate — see
 * `point_ledger.dollar_value`). Same shape as the goal builder's
 * *projected* `rewardRatio` (`src/lib/challenges/recommendations.ts`),
 * reused rather than duplicated: "profit per reward dollar" means the
 * same thing whether the profit is projected or actual.
 */
export function computeRewardRoi(actualContributionProfit: number, actualRewardCost: number): number {
  return rewardRatio(actualContributionProfit, actualRewardCost);
}
