import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { toEngineTransactions } from "./from-db";
import { computeMetric, byLocation, byEmployee, DETECTOR_METRIC_CODES } from "./index";
import type { Inserts } from "@/lib/types/database";

/**
 * Runs the Phase 4 engine over an organization's current transactions and
 * writes a fresh batch of `metric_snapshots` rows — the "triggers metric
 * calculations" step of CSV import (spec §19). Called at the end of a
 * successful import (`src/app/manager/settings/data-sources/actions.ts`).
 *
 * `metric_snapshots.location_id` is `not null` in the schema (spec §5) —
 * there's no such thing as an organization-wide row, only per-location and
 * per-location-per-employee ones. An employee working multiple locations
 * gets one row per location they actually have transactions at, computed
 * only from that location's transactions — "Sarah's beverage attachment
 * at Store #37," not a cross-location blend, matching how challenges and
 * leaderboards are themselves location-scoped. A true organization-wide
 * figure (what Manager Home shows today) is computed on demand
 * (`computeMetricForOrganization`) rather than stored — see
 * ARCHITECTURE.md.
 *
 * Every call inserts new rows rather than updating existing ones —
 * `metric_snapshots` is a history, not a current-value cache; each import
 * is a fresh dated snapshot of where things stood.
 */
export async function recalculateMetricSnapshots(organizationId: string): Promise<{ snapshotsWritten: number }> {
  const supabase = createServiceRoleClient();

  const [{ data: transactions, error: txError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from("transactions").select("*").eq("organization_id", organizationId),
    supabase.from("transaction_items").select("*").eq("organization_id", organizationId),
  ]);

  if (txError) throw txError;
  if (itemError) throw itemError;
  if (!transactions || transactions.length === 0) return { snapshotsWritten: 0 };

  // The snapshot period covers whatever clean data actually fed the
  // calculation — a dirty (voided/refunded) transaction's timestamp
  // shouldn't stretch the claimed period.
  const cleanTimestamps = transactions
    .filter((t) => !t.voided && t.refund_amount === 0)
    .map((t) => t.transaction_timestamp);
  if (cleanTimestamps.length === 0) return { snapshotsWritten: 0 };

  const periodStart = cleanTimestamps.reduce((min, t) => (t < min ? t : min)).slice(0, 10);
  const periodEnd = cleanTimestamps.reduce((max, t) => (t > max ? t : max)).slice(0, 10);

  const engineTransactions = toEngineTransactions(transactions, items ?? []);
  const rows: Inserts<"metric_snapshots">[] = [];

  for (const [locationId, locationTxns] of byLocation(engineTransactions)) {
    for (const metricCode of DETECTOR_METRIC_CODES) {
      const locationResult = computeMetric(metricCode, locationTxns);
      rows.push({
        organization_id: organizationId,
        location_id: locationId,
        employee_id: null,
        metric_code: metricCode,
        period_start: periodStart,
        period_end: periodEnd,
        numerator: locationResult.numerator,
        denominator: locationResult.denominator,
        value: locationResult.value,
      });
    }

    for (const [employeeId, employeeTxns] of byEmployee(locationTxns)) {
      for (const metricCode of DETECTOR_METRIC_CODES) {
        const employeeResult = computeMetric(metricCode, employeeTxns);
        rows.push({
          organization_id: organizationId,
          location_id: locationId,
          employee_id: employeeId,
          metric_code: metricCode,
          period_start: periodStart,
          period_end: periodEnd,
          numerator: employeeResult.numerator,
          denominator: employeeResult.denominator,
          value: employeeResult.value,
        });
      }
    }
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase.from("metric_snapshots").insert(rows.slice(i, i + BATCH_SIZE));
    if (error) throw error;
  }

  return { snapshotsWritten: rows.length };
}
