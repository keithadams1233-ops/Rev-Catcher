import { describe, it, expect } from "vitest";
import { evaluateNewBadges, type BadgeDefinition, type BadgeEvaluationState } from "./badges";

// Mirrors supabase/migrations/0002_reference_data.sql exactly.
const BADGES: BadgeDefinition[] = [
  { code: "fast_starter", criteriaType: "missions_completed", criteriaValue: 1 },
  { code: "hot_streak", criteriaType: "streak_days", criteriaValue: 7 },
  { code: "top_5", criteriaType: "challenge_rank_max", criteriaValue: 5 },
  { code: "top_3", criteriaType: "challenge_rank_max", criteriaValue: 3 },
  { code: "challenge_winner", criteriaType: "challenge_rank_max", criteriaValue: 1 },
  { code: "team_player", criteriaType: "team_goals_completed", criteriaValue: 1 },
  { code: "level_10", criteriaType: "level_reached", criteriaValue: 10 },
  { code: "level_25", criteriaType: "level_reached", criteriaValue: 25 },
];

const BASE_STATE: BadgeEvaluationState = {
  currentLevel: 1,
  currentStreak: 0,
  completedMissionCount: 0,
  teamGoalsCompletedCount: 0,
  bestChallengeRank: null,
};

describe("evaluateNewBadges", () => {
  it("awards nothing when no criteria are met", () => {
    expect(evaluateNewBadges(BADGES, BASE_STATE, [])).toEqual([]);
  });

  it("awards every threshold newly crossed in one evaluation", () => {
    const state: BadgeEvaluationState = {
      ...BASE_STATE,
      currentLevel: 12,
      currentStreak: 11, // matches spec's own 11-day-streak example
      completedMissionCount: 1,
    };
    const codes = evaluateNewBadges(BADGES, state, []);
    expect(codes.sort()).toEqual(["fast_starter", "hot_streak", "level_10"].sort());
  });

  it("never re-awards a badge already in alreadyEarnedCodes", () => {
    const state: BadgeEvaluationState = { ...BASE_STATE, completedMissionCount: 1 };
    expect(evaluateNewBadges(BADGES, state, ["fast_starter"])).toEqual([]);
    expect(evaluateNewBadges(BADGES, state, new Set(["fast_starter"]))).toEqual([]);
  });

  it("challenge_rank_max is 'best rank at or better than' — top_3 implies top_5 too", () => {
    const state: BadgeEvaluationState = { ...BASE_STATE, bestChallengeRank: 2 };
    const codes = evaluateNewBadges(BADGES, state, []);
    expect(codes.sort()).toEqual(["top_3", "top_5"].sort());
  });

  it("rank 1 crosses every rank badge including challenge_winner", () => {
    const state: BadgeEvaluationState = { ...BASE_STATE, bestChallengeRank: 1 };
    const codes = evaluateNewBadges(BADGES, state, []);
    expect(codes.sort()).toEqual(["challenge_winner", "top_3", "top_5"].sort());
  });

  it("a null bestChallengeRank never qualifies a rank badge", () => {
    expect(evaluateNewBadges(BADGES, BASE_STATE, [])).toEqual([]);
  });

  it("an unrecognized criteria_type is never auto-awarded", () => {
    const weird: BadgeDefinition = { code: "mystery", criteriaType: "something_new", criteriaValue: 1 };
    const state: BadgeEvaluationState = { ...BASE_STATE, currentLevel: 999 };
    expect(evaluateNewBadges([weird], state, [])).toEqual([]);
  });
});
