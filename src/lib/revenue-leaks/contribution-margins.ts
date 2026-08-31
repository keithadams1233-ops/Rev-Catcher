import type { DetectorMetricCode } from "@/lib/metrics/types";

/**
 * Estimated contribution-margin assumption per metric/category (spec §8:
 * "For MVP allow managers to configure estimated category margin.")
 * Configuration UI is deliberately deferred — same call as
 * category-rules.ts in the metric engine (Phase 4): every function that
 * needs a margin takes it as a parameter (see `marginOverride` in
 * opportunity.ts), defaulting to this table, so a persisted per-org
 * override later is a data-source change, not a rewrite. These exact
 * figures match what `scripts/seed.ts` used for the hand-authored demo
 * leaks, so real detection and the demo data reason about margin
 * identically.
 */
export const DEFAULT_CONTRIBUTION_MARGINS: Record<DetectorMetricCode, number> = {
  beverage_attachment: 0.7,
  dessert_attachment: 0.68,
  addon_attachment: 0.65,
  premium_upgrade_rate: 0.6,
  average_ticket: 0.55,
};
