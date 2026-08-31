import { percentile, mean } from "@/lib/stats";
import type { BenchmarkResult } from "./types";

/**
 * Enough comparable locations for a top-quartile benchmark to mean
 * something, rather than being one or two locations' noise dressed up as
 * a percentile (spec §7: "top-performing quartile of comparable
 * locations when enough data exists").
 */
export const MIN_LOCATIONS_FOR_QUARTILE_BENCHMARK = 4;

/**
 * Spec §7's two-tier MVP default: top-performing quartile of comparable
 * locations when there's enough of them, else organization average.
 * Returns null when there isn't even a second location to compare
 * against — a location can't be "underperforming" relative to itself,
 * and there's nothing here for spec §7's third option (historical
 * location baseline) to fall back to yet.
 */
export function computeBenchmark(values: number[]): BenchmarkResult | null {
  if (values.length < 2) return null;

  if (values.length >= MIN_LOCATIONS_FOR_QUARTILE_BENCHMARK) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      value: percentile(sorted, 0.75),
      source: "top_quartile",
      comparableLocationCount: values.length,
    };
  }

  return {
    value: mean(values),
    source: "organization_average",
    comparableLocationCount: values.length,
  };
}
