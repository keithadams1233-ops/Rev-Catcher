/**
 * Deterministic recommendation math for the goal builder (spec §9–10).
 * Nothing here is AI-assisted — it's the same kind of plain arithmetic the
 * detection engine uses, just applied to "what should the manager launch."
 */

export const REWARD_BUDGET_PRESETS = [0.1, 0.15, 0.2] as const;
export const DEFAULT_REWARD_BUDGET_PCT = 0.15;
export const MIN_HEALTHY_REWARD_RATIO = 3;

export const CHALLENGE_DURATION_OPTIONS = [7, 14, 30] as const;
export const DEFAULT_CHALLENGE_DURATION_DAYS = 14;

/**
 * Recommends a target partway between the current value and the full
 * benchmark — a stretch that doesn't require hitting the top-quartile
 * benchmark in one challenge. Rounds to whole points for rate metrics,
 * to the cent for dollar metrics (average ticket).
 */
export function recommendTarget(currentValue: number, benchmarkValue: number, isDollar: boolean): number {
  const raw = currentValue + (benchmarkValue - currentValue) * 0.6;
  return isDollar ? Math.round(raw * 100) / 100 : Math.round(raw * 1000) / 1000;
}

/**
 * Scales a leak's full-benchmark revenue/profit estimate down to the
 * fraction of the gap the challenge target actually closes.
 */
export function scaleOpportunityToTarget(
  fullRevenue: number,
  fullProfit: number,
  currentValue: number,
  benchmarkValue: number,
  targetValue: number,
): { revenue: number; profit: number } {
  const fullGap = benchmarkValue - currentValue;
  const targetGap = targetValue - currentValue;
  const scale = fullGap > 0 ? Math.min(Math.max(targetGap / fullGap, 0), 1.5) : 0;
  return {
    revenue: Math.round(fullRevenue * scale),
    profit: Math.round(fullProfit * scale),
  };
}

export interface RecommendedTier {
  name: string;
  thresholdValue: number;
  pointsAwarded: number;
}

/**
 * Three tiers spanning current -> target -> benchmark, with the spec's
 * example point ladder (500 / 1,000 / 2,500). Managers can edit every
 * field before launch.
 */
export function recommendTiers(
  currentValue: number,
  targetValue: number,
  benchmarkValue: number,
  isDollar: boolean,
): RecommendedTier[] {
  const round = (v: number) => (isDollar ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000);
  const tier1 = round(currentValue + (targetValue - currentValue) * 0.5);
  const tier2 = round(targetValue);
  const tier3 = round(Math.max(benchmarkValue, targetValue));

  return [
    { name: "Level 1", thresholdValue: tier1, pointsAwarded: 500 },
    { name: "Level 2", thresholdValue: tier2, pointsAwarded: 1000 },
    { name: "Level 3", thresholdValue: tier3, pointsAwarded: 2500 },
  ];
}

export function rewardBudgetFromPct(projectedProfit: number, pct: number): number {
  return Math.round(projectedProfit * pct);
}

export function rewardRatio(projectedProfit: number, rewardBudget: number): number {
  if (rewardBudget <= 0) return Infinity;
  return projectedProfit / rewardBudget;
}

export function isRewardRatioHealthy(ratio: number): boolean {
  return ratio >= MIN_HEALTHY_REWARD_RATIO;
}
