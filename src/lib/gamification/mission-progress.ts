import { calculateAttachmentRate, DEFAULT_ATTACHMENT_RULES } from "../metrics";
import type { AttachmentMetricCode, EngineTransaction } from "../metrics";

/**
 * Daily-mission progress (spec §11). Reuses the Phase 4 attachment engine
 * rather than re-deriving eligibility/anti-gaming rules a second time —
 * a mission against `beverage_attachment` is measuring the exact same
 * thing a revenue-leak detector or a challenge tier is, just scoped to one
 * employee's transactions for `active_date`.
 *
 * `daily_missions` doesn't carry an explicit "is this a count or a rate"
 * flag — `metric_code` + `target_value` is all there is (see
 * `scripts/seed.ts`'s `DAILY_MISSIONS`: "First 5 Wins" targets 5, "Perfect
 * Hour" targets 0.5). Every seeded/spec'd rate is a 0-1 fraction and every
 * seeded/spec'd count is a whole number of transactions >= 2, so
 * `target_value > 1` unambiguously means "count of attached transactions"
 * and anything <= 1 means "attachment rate". A mission literally targeting
 * "attach to exactly 1 transaction" would be misclassified as a rate
 * mission by this heuristic — an acceptable edge case for a target no real
 * mission uses (why would a count mission want just 1 attach?).
 */

export const MIN_SAMPLE_FOR_RATE_MISSION = 10;

export type MissionKind = "count" | "rate";

export function classifyMissionKind(targetValue: number): MissionKind {
  return targetValue > 1 ? "count" : "rate";
}

export interface MissionProgressResult {
  currentValue: number;
  completed: boolean;
}

/**
 * Only covers the four attachment-style metrics (`AttachmentMetricCode`).
 * `average_ticket`/`loyalty_enrollment` missions and rank-based missions
 * (`metric_code: null`, e.g. "Climb One Spot") aren't auto-tracked by this
 * function — the gamification job skips them, same documented scope cut
 * as the rest of Phase 8 (no leaderboard-history infra to diff against for
 * a rank mission, and no dollar-target or loyalty semantics defined for
 * the other two metric codes in the spec's mission examples).
 */
export function computeMissionProgress(
  metricCode: AttachmentMetricCode,
  targetValue: number,
  dayTransactions: EngineTransaction[],
): MissionProgressResult {
  const result = calculateAttachmentRate(dayTransactions, DEFAULT_ATTACHMENT_RULES[metricCode]);
  const kind = classifyMissionKind(targetValue);

  if (kind === "count") {
    const currentValue = result.numerator;
    return { currentValue, completed: currentValue >= targetValue };
  }

  // Rate mission: never credit completion off a tiny, luck-driven sample
  // (spec §16's anti-gaming floor, applied here the same way the leak/
  // challenge engines apply it to their own denominators).
  const currentValue = result.value;
  const completed = result.denominator >= MIN_SAMPLE_FOR_RATE_MISSION && currentValue >= targetValue;
  return { currentValue, completed };
}
