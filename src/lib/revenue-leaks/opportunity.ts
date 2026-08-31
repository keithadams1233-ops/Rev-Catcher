import { DEFAULT_CONTRIBUTION_MARGINS } from "./contribution-margins";
import type { DetectorMetricCode } from "@/lib/metrics/types";

export interface OpportunityInput {
  metricCode: DetectorMetricCode;
  currentValue: number;
  benchmarkValue: number;
  /** Eligible transactions in the snapshot period, already extrapolated
   * to a 30-day month — see `extrapolateEligiblePerMonth`. */
  eligibleTransactionsPerMonth: number;
  /** Average price of the target/attached item. Unused for
   * `average_ticket`, whose gap is already a dollar amount. */
  avgAttachedItemPrice: number;
  marginOverride?: number;
}

export interface OpportunityResult {
  gap: number;
  estimatedIncrementalRevenue: number;
  estimatedContributionProfit: number;
}

/**
 * Spec §8:
 *   estimated_incremental_revenue = eligible_transactions_per_month × gap × avg_attached_item_price
 *   estimated_contribution_profit = estimated_incremental_revenue × category_margin
 *
 * `average_ticket` is already a dollar metric — its gap (benchmark ticket
 * minus current ticket, in dollars) *is* the per-transaction opportunity,
 * so multiplying by an item price would double-count it; that term is
 * dropped for this one metric.
 *
 * A non-positive gap (at or above benchmark) isn't a leak — returns
 * zeroed results rather than a negative "opportunity."
 */
export function calculateOpportunity(input: OpportunityInput): OpportunityResult {
  const gap = round6(input.benchmarkValue - input.currentValue);

  if (gap <= 0) {
    return { gap, estimatedIncrementalRevenue: 0, estimatedContributionProfit: 0 };
  }

  const revenue =
    input.metricCode === "average_ticket"
      ? input.eligibleTransactionsPerMonth * gap
      : input.eligibleTransactionsPerMonth * gap * input.avgAttachedItemPrice;

  const margin = input.marginOverride ?? DEFAULT_CONTRIBUTION_MARGINS[input.metricCode];

  return {
    gap,
    estimatedIncrementalRevenue: round2(revenue),
    estimatedContributionProfit: round2(revenue * margin),
  };
}

/** A snapshot's eligible-transaction count, scaled from its actual period
 * length to a standard 30-day month — the spec's formula is monthly, but
 * a snapshot's period is whatever data was actually available. */
export function extrapolateEligiblePerMonth(denominator: number, periodStart: string, periodEnd: string): number {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
  return denominator * (30 / days);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
