/**
 * Badge criteria evaluation (spec §12), data-driven against the seeded
 * `badges` table's `criteria_type` / `criteria_value` columns
 * (`supabase/migrations/0002_reference_data.sql`) rather than a hardcoded
 * switch per badge code — a manager adding a new badge row with an
 * existing `criteria_type` needs no code change to start being evaluated.
 */

export interface BadgeDefinition {
  code: string;
  criteriaType: string;
  criteriaValue: number | null;
}

/**
 * Everything a badge's criteria might need to check, gathered once per
 * employee per gamification run. `bestChallengeRank` is the best (lowest)
 * `final_rank` across the employee's completed challenges, or `null` if
 * they haven't finished one yet — `challenge_rank_max` criteria (top_5/
 * top_3/challenge_winner) can never be met without it.
 */
export interface BadgeEvaluationState {
  currentLevel: number;
  currentStreak: number;
  completedMissionCount: number;
  teamGoalsCompletedCount: number;
  bestChallengeRank: number | null;
}

function meetsCriteria(definition: BadgeDefinition, state: BadgeEvaluationState): boolean {
  const threshold = definition.criteriaValue;
  if (threshold === null) return false;

  switch (definition.criteriaType) {
    case "missions_completed":
      return state.completedMissionCount >= threshold;
    case "streak_days":
      return state.currentStreak >= threshold;
    case "level_reached":
      return state.currentLevel >= threshold;
    case "team_goals_completed":
      return state.teamGoalsCompletedCount >= threshold;
    case "challenge_rank_max":
      // "max" = best rank allowed to still qualify, e.g. top_5 -> rank <= 5.
      return state.bestChallengeRank !== null && state.bestChallengeRank <= threshold;
    default:
      // Unrecognized criteria type: never auto-award rather than guess.
      return false;
  }
}

/**
 * Returns the codes of every badge `state` newly qualifies for, excluding
 * ones in `alreadyEarnedCodes` — badges are earned once (schema has a
 * unique `(employee_id, badge_id)`), never re-evaluated after that.
 */
export function evaluateNewBadges(
  badgeDefinitions: BadgeDefinition[],
  state: BadgeEvaluationState,
  alreadyEarnedCodes: Set<string> | string[],
): string[] {
  const earned = alreadyEarnedCodes instanceof Set ? alreadyEarnedCodes : new Set(alreadyEarnedCodes);

  return badgeDefinitions
    .filter((definition) => !earned.has(definition.code))
    .filter((definition) => meetsCriteria(definition, state))
    .map((definition) => definition.code);
}
