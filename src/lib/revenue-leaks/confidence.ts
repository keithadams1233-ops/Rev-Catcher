import { MIN_LOCATIONS_FOR_QUARTILE_BENCHMARK } from "./benchmark";

/**
 * Deterministic confidence score (0–1). `confidenceLabel()` in
 * `src/lib/format.ts` buckets it into High/Medium/Low for display —
 * never a guarantee, per spec §5/§25.
 *
 * Two independent inputs, averaged:
 * - **Sample size** — how much data backs the *current* value. Reaches
 *   full score at `FULL_CONFIDENCE_SAMPLE_SIZE` eligible transactions.
 * - **Benchmark quality** — how solid the *benchmark* is. A top-quartile
 *   benchmark drawn from several locations is more trustworthy than a
 *   two-location average, which is more trustworthy than none at all.
 */
export const FULL_CONFIDENCE_SAMPLE_SIZE = 100;

export function classifyConfidence(denominator: number, comparableLocationCount: number): number {
  const sampleScore = Math.min(denominator / FULL_CONFIDENCE_SAMPLE_SIZE, 1);
  const benchmarkScore =
    comparableLocationCount >= MIN_LOCATIONS_FOR_QUARTILE_BENCHMARK ? 1 : comparableLocationCount >= 2 ? 0.6 : 0;

  return Math.round(((sampleScore + benchmarkScore) / 2) * 1000) / 1000;
}
