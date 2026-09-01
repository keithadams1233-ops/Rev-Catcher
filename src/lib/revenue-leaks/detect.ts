import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { DETECTOR_METRIC_CODES, type DetectorMetricCode } from "@/lib/metrics/types";
import { computeBenchmark } from "./benchmark";
import { calculateOpportunity, extrapolateEligiblePerMonth } from "./opportunity";
import { classifyConfidence } from "./confidence";
import { getAvgAttachedItemPrice } from "./avg-item-price";
import type { Tables } from "@/lib/types/database";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
type MetricSnapshot = Tables<"metric_snapshots">;

/** Below this, a location/metric pair's sample is too thin to report at
 * all — not even a Low-confidence leak. `classifyConfidence` handles
 * everything above this floor gracefully; this is the hard cutoff. */
const MIN_DENOMINATOR_TO_REPORT = 3;

const DETECTOR_SET = new Set<string>(DETECTOR_METRIC_CODES);

export interface DetectionSummary {
  leaksCreated: number;
  leaksUpdated: number;
  leaksResolved: number;
}

/**
 * Spec §7-9: benchmark calc, gap, revenue/profit opportunity, confidence
 * classification — reads the metric engine's own output
 * (`metric_snapshots`, written by `src/lib/metrics/recalculate.ts`) and
 * writes `revenue_leaks`. Called at the end of a successful CSV import
 * (spec §19 step 8) and from a manual "Detect Leaks" action on the Leaks
 * screen.
 */
export async function detectRevenueLeaks(organizationId: string): Promise<DetectionSummary> {
  const supabase = createServiceRoleClient();

  const [{ data: snapshots, error }, { data: activeLocations, error: locError }] = await Promise.all([
    supabase
      .from("metric_snapshots")
      .select("*")
      .eq("organization_id", organizationId)
      .is("employee_id", null)
      .order("created_at", { ascending: false }),
    supabase.from("locations").select("id").eq("organization_id", organizationId).eq("active", true),
  ]);

  if (error) throw error;
  if (locError) throw locError;
  if (!snapshots || snapshots.length === 0) return { leaksCreated: 0, leaksUpdated: 0, leaksResolved: 0 };

  // A closed/inactive location (spec §10 "location changes") never feeds
  // the benchmark and never gets a new leak — its numbers are frozen in
  // time, not comparable to locations still operating, and there's no
  // "opportunity" left to report for a store that's shut down. Any leak
  // already open for it stays exactly as it was, untouched by this run.
  const activeLocationIds = new Set((activeLocations ?? []).map((l) => l.id));

  // Most recent snapshot per (location, metric) — rows are already
  // ordered newest-first, so the first one seen per key wins.
  const latestByKey = new Map<string, MetricSnapshot>();
  for (const s of snapshots) {
    if (!activeLocationIds.has(s.location_id)) continue;
    const key = `${s.location_id}:${s.metric_code}`;
    if (!latestByKey.has(key)) latestByKey.set(key, s);
  }

  const byMetric = new Map<DetectorMetricCode, MetricSnapshot[]>();
  for (const s of latestByKey.values()) {
    if (!DETECTOR_SET.has(s.metric_code)) continue;
    const code = s.metric_code as DetectorMetricCode;
    const list = byMetric.get(code);
    if (list) list.push(s);
    else byMetric.set(code, [s]);
  }

  // One price lookup per (location, metric) per detection run, even
  // though several snapshots (org/location/employee grain) could ask for
  // the same pair -- `getAvgAttachedItemPrice` itself doesn't cache, so
  // this run-scoped cache is what keeps a big org's detection pass from
  // re-querying transaction_items redundantly.
  const priceCache = new Map<string, number>();
  const cachedAvgAttachedItemPrice = async (
    locationId: string,
    metricCode: Exclude<DetectorMetricCode, "average_ticket">,
  ): Promise<number> => {
    const key = `${locationId}:${metricCode}`;
    const cached = priceCache.get(key);
    if (cached !== undefined) return cached;

    const price = await getAvgAttachedItemPrice(supabase, organizationId, locationId, metricCode);
    priceCache.set(key, price);
    return price;
  };

  const summary: DetectionSummary = { leaksCreated: 0, leaksUpdated: 0, leaksResolved: 0 };

  for (const [metricCode, locationSnapshots] of byMetric) {
    const benchmark = computeBenchmark(locationSnapshots.map((s) => s.value));
    if (!benchmark) continue; // no comparable locations — nothing to benchmark against yet

    for (const snapshot of locationSnapshots) {
      if (snapshot.denominator < MIN_DENOMINATOR_TO_REPORT) continue;

      const avgAttachedItemPrice =
        metricCode === "average_ticket" ? 0 : await cachedAvgAttachedItemPrice(snapshot.location_id, metricCode);
      if (metricCode !== "average_ticket" && avgAttachedItemPrice === 0) continue; // no pricing data to estimate revenue from

      const eligibleTransactionsPerMonth = extrapolateEligiblePerMonth(
        snapshot.denominator,
        snapshot.period_start,
        snapshot.period_end,
      );

      const opportunity = calculateOpportunity({
        metricCode,
        currentValue: snapshot.value,
        benchmarkValue: benchmark.value,
        eligibleTransactionsPerMonth,
        avgAttachedItemPrice,
      });

      const confidenceScore = classifyConfidence(snapshot.denominator, benchmark.comparableLocationCount);

      const outcome = await upsertLeak(supabase, {
        organizationId,
        locationId: snapshot.location_id,
        metricCode,
        currentValue: snapshot.value,
        benchmarkValue: benchmark.value,
        gap: opportunity.gap,
        estimatedIncrementalRevenue: opportunity.estimatedIncrementalRevenue,
        estimatedContributionProfit: opportunity.estimatedContributionProfit,
        confidenceScore,
      });

      if (outcome === "created") summary.leaksCreated += 1;
      else if (outcome === "updated") summary.leaksUpdated += 1;
      else if (outcome === "resolved") summary.leaksResolved += 1;
    }
  }

  return summary;
}

interface ComputedLeak {
  organizationId: string;
  locationId: string;
  metricCode: DetectorMetricCode;
  currentValue: number;
  benchmarkValue: number;
  gap: number;
  estimatedIncrementalRevenue: number;
  estimatedContributionProfit: number;
  confidenceScore: number;
}

/**
 * One row per (organization, location, metric) — updated in place across
 * detection runs, not appended, so a leak's status lifecycle
 * (open -> challenge_created -> dismissed/resolved) survives a re-run. A
 * leak already acted on (anything but `open`) is never overwritten with
 * fresh numbers; a location that catches up to benchmark on an `open`
 * leak resolves it automatically instead of leaving a stale zero-gap row.
 */
async function upsertLeak(
  supabase: ServiceClient,
  computed: ComputedLeak,
): Promise<"created" | "updated" | "resolved" | "skipped"> {
  const { data: existing, error } = await supabase
    .from("revenue_leaks")
    .select("id, status")
    .eq("organization_id", computed.organizationId)
    .eq("location_id", computed.locationId)
    .eq("metric_code", computed.metricCode)
    .maybeSingle();
  if (error) throw error;

  if (!existing) {
    if (computed.gap <= 0) return "skipped";
    const { error: insertError } = await supabase.from("revenue_leaks").insert({
      organization_id: computed.organizationId,
      location_id: computed.locationId,
      metric_code: computed.metricCode,
      current_value: computed.currentValue,
      benchmark_value: computed.benchmarkValue,
      gap: computed.gap,
      estimated_incremental_revenue: computed.estimatedIncrementalRevenue,
      estimated_contribution_profit: computed.estimatedContributionProfit,
      confidence_score: computed.confidenceScore,
      status: "open",
    });
    if (insertError) throw insertError;
    return "created";
  }

  if (existing.status !== "open") return "skipped";

  if (computed.gap <= 0) {
    const { error: resolveError } = await supabase
      .from("revenue_leaks")
      .update({
        current_value: computed.currentValue,
        benchmark_value: computed.benchmarkValue,
        gap: computed.gap,
        status: "resolved",
        detected_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (resolveError) throw resolveError;
    return "resolved";
  }

  const { error: updateError } = await supabase
    .from("revenue_leaks")
    .update({
      current_value: computed.currentValue,
      benchmark_value: computed.benchmarkValue,
      gap: computed.gap,
      estimated_incremental_revenue: computed.estimatedIncrementalRevenue,
      estimated_contribution_profit: computed.estimatedContributionProfit,
      confidence_score: computed.confidenceScore,
      detected_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (updateError) throw updateError;
  return "updated";
}
