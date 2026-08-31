import type { EngineTransaction, EngineTransactionItem } from "./types";

/**
 * Anti-gaming rule (spec §16): a transaction touched by a void or a refund
 * never counts toward any metric — not "counts at a reduced value," not
 * "counts unless fully voided." A partial refund on an otherwise-normal
 * ticket is exactly the kind of messy edge case that would otherwise let a
 * transaction quietly inflate an attachment rate or an average ticket.
 */
export function isCleanTransaction(txn: EngineTransaction): boolean {
  return !txn.voided && txn.refundAmount === 0;
}

/** Same rule at the line-item level — an item voided/refunded off an
 * otherwise-clean transaction was never really "attached." */
export function isCleanItem(item: EngineTransactionItem): boolean {
  return !item.voided && !item.refunded;
}

/**
 * Extreme-outlier exclusion for average ticket (spec §7, Detector 4).
 * Standard IQR fencing: drop values outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR].
 * Only applied once there's enough data for quartiles to mean anything —
 * below that, an "outlier" call is just noise, so everything is kept.
 */
export const MIN_SAMPLE_SIZE_FOR_OUTLIER_EXCLUSION = 8;

export function excludeOutliers(values: number[]): number[] {
  if (values.length < MIN_SAMPLE_SIZE_FOR_OUTLIER_EXCLUSION) return values;

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return values.filter((v) => v >= lowerBound && v <= upperBound);
}

/** Linear-interpolation percentile over an already-sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
