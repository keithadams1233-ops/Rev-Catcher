import { isCleanTransaction, excludeOutliers } from "./eligibility";
import type { EngineTransaction, MetricResult } from "./types";

/**
 * Average ticket (spec §7, Detector 4): mean transaction total, excluding
 * refunds, voids, and extreme outliers. `numerator` is the summed total of
 * the transactions that made it through both filters; `denominator` is how
 * many did.
 */
export function calculateAverageTicket(transactions: EngineTransaction[]): MetricResult {
  const cleanTotals = transactions.filter(isCleanTransaction).map((t) => t.total);
  const filtered = excludeOutliers(cleanTotals);

  const numerator = round2(filtered.reduce((sum, v) => sum + v, 0));
  const denominator = filtered.length;

  return {
    numerator,
    denominator,
    value: denominator > 0 ? round2(numerator / denominator) : 0,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
