/**
 * Small shared statistics helpers — used by the metric engine's outlier
 * fencing (`src/lib/metrics/eligibility.ts`) and the revenue-leak
 * engine's top-quartile benchmark (`src/lib/revenue-leaks/benchmark.ts`).
 * Kept here once rather than duplicated so both use the exact same
 * percentile math.
 */

/** Linear-interpolation percentile. `sorted` must already be ascending. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile() called with an empty array");
  if (sorted.length === 1) return sorted[0];
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
