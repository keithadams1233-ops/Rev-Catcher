/**
 * Deterministic challenge-progress math (spec §7 build order: "progress
 * updates, rankings, challenge completion"). Pure functions — the impure
 * job that reads snapshots and writes these results
 * (`src/lib/challenges/update-progress.ts`) is a separate module, same
 * split as the metric and revenue-leak engines.
 */

export interface Tier {
  id: string;
  thresholdValue: number;
  pointsAwarded: number;
}

export interface ParticipantUpdate {
  currentValue: number;
  bestValue: number;
  pointsEarned: number;
  completed: boolean;
  /** Tier ids crossed *by this update* — what to award points for. */
  newlyCrossedTiers: Tier[];
}

/**
 * Rewards are keyed off `bestValue` (the participant's peak, not their
 * latest reading) so a bad day after a tier is already earned never
 * takes points back — matches `challenge_participants.best_value`'s
 * evident purpose in the schema. A tier already reflected in
 * `previousBestValue` is never re-awarded here; the point_ledger's own
 * partial unique index (`source_type` + `source_id`) is the last-resort
 * backstop against double-awarding, not the only guard.
 */
export function computeParticipantUpdate(
  previousBestValue: number,
  previousPointsEarned: number,
  newValue: number,
  tiers: Tier[],
): ParticipantUpdate {
  const bestValue = Math.max(previousBestValue, newValue);
  const newlyCrossedTiers = tiers.filter((t) => bestValue >= t.thresholdValue && previousBestValue < t.thresholdValue);
  const pointsEarned = previousPointsEarned + newlyCrossedTiers.reduce((sum, t) => sum + t.pointsAwarded, 0);
  const completed = tiers.length > 0 && tiers.every((t) => bestValue >= t.thresholdValue);

  return { currentValue: newValue, bestValue, pointsEarned, completed, newlyCrossedTiers };
}

/**
 * Simple sequential ranking (1 = best) by current value, descending.
 * Ties break by array order rather than sharing a rank — good enough for
 * an MVP leaderboard; spec doesn't call for competition-style tie
 * handling (1,1,3).
 */
export function computeRankings(entries: Array<{ employeeId: string; currentValue: number }>): Map<string, number> {
  const sorted = [...entries].sort((a, b) => b.currentValue - a.currentValue);
  return new Map(sorted.map((e, i) => [e.employeeId, i + 1]));
}

export interface TeamGoalUpdate {
  currentValue: number;
  justCompleted: boolean;
}

/** `justCompleted` is true only on the transition — never re-fires for a
 * team goal that was already marked completed on a previous run. */
export function computeTeamGoalUpdate(
  previouslyCompleted: boolean,
  targetValue: number,
  newLocationValue: number,
): TeamGoalUpdate {
  return {
    currentValue: newLocationValue,
    justCompleted: !previouslyCompleted && newLocationValue >= targetValue,
  };
}

/** `endDate` and `today` are both YYYY-MM-DD — plain string comparison
 * is correct and avoids timezone footguns a `Date` object would invite. */
export function isChallengeExpired(endDate: string, today: string = new Date().toISOString().slice(0, 10)): boolean {
  return today > endDate;
}
