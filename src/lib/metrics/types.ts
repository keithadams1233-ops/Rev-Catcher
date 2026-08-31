/**
 * Metric engine input/output shapes (spec §7). Deliberately decoupled from
 * the Supabase `Database` row types: the engine is a set of pure functions
 * over plain data so it's trivial to unit test without a database, and so
 * a future POS adapter (Toast/Square/Clover — see ARCHITECTURE.md "Future
 * POS adapter design") only has to normalize into this shape, not into our
 * table schema directly. `src/lib/metrics/from-db.ts` is the one place
 * that maps real `transactions`/`transaction_items` rows into it.
 */

export interface EngineTransactionItem {
  category: string | null;
  itemName: string;
  modifierNames: string[];
  quantity: number;
  totalPrice: number;
  refunded: boolean;
  voided: boolean;
}

export interface EngineTransaction {
  id: string;
  locationId: string;
  employeeId: string | null;
  total: number;
  refundAmount: number;
  voided: boolean;
  items: EngineTransactionItem[];
}

export const DETECTOR_METRIC_CODES = [
  "beverage_attachment",
  "addon_attachment",
  "premium_upgrade_rate",
  "average_ticket",
  "dessert_attachment",
] as const;

export type DetectorMetricCode = (typeof DETECTOR_METRIC_CODES)[number];

/**
 * Every detector's output: what fraction/average was measured, and the
 * eligible-transaction count it was measured over. `denominator` is what a
 * caller (leaderboard ranking, leak detection) should threshold against
 * for the "minimum eligible transactions before ranking anyone" rule
 * (spec §16) — this engine computes it, but doesn't itself decide what a
 * safe minimum is; that's a policy decision for whoever's ranking or
 * flagging leaks with it.
 */
export interface MetricResult {
  numerator: number;
  denominator: number;
  value: number;
}
