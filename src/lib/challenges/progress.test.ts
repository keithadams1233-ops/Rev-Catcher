import { describe, it, expect } from "vitest";
import { computeParticipantUpdate, computeRankings, computeTeamGoalUpdate, isChallengeExpired } from "./progress";

const TIERS = [
  { id: "t1", thresholdValue: 0.32, pointsAwarded: 500 },
  { id: "t2", thresholdValue: 0.36, pointsAwarded: 1000 },
  { id: "t3", thresholdValue: 0.42, pointsAwarded: 2500 },
];

describe("computeParticipantUpdate", () => {
  it("awards a newly crossed tier and its points", () => {
    const result = computeParticipantUpdate(0.3, 0, 0.34, TIERS);
    expect(result.bestValue).toBe(0.34);
    expect(result.pointsEarned).toBe(500);
    expect(result.newlyCrossedTiers.map((t) => t.id)).toEqual(["t1"]);
    expect(result.completed).toBe(false);
  });

  it("awards multiple tiers crossed in a single jump", () => {
    const result = computeParticipantUpdate(0.28, 0, 0.4, TIERS);
    expect(result.newlyCrossedTiers.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(result.pointsEarned).toBe(1500);
  });

  it("never re-awards a tier already reflected in the previous best value", () => {
    // Already at 0.34 (tier 1 earned); a new reading of 0.33 shouldn't
    // re-award tier 1, and best value shouldn't regress.
    const result = computeParticipantUpdate(0.34, 500, 0.33, TIERS);
    expect(result.newlyCrossedTiers).toEqual([]);
    expect(result.pointsEarned).toBe(500);
    expect(result.bestValue).toBe(0.34);
    expect(result.currentValue).toBe(0.33); // current reflects the latest reading even though best doesn't regress
  });

  it("marks completed only once every tier is reached", () => {
    const almost = computeParticipantUpdate(0.36, 1500, 0.4, TIERS);
    expect(almost.completed).toBe(false);

    const done = computeParticipantUpdate(0.4, 1500, 0.45, TIERS);
    expect(done.completed).toBe(true);
    expect(done.newlyCrossedTiers.map((t) => t.id)).toEqual(["t3"]);
  });

  it("is never completed when there are no tiers to begin with", () => {
    const result = computeParticipantUpdate(0, 0, 1, []);
    expect(result.completed).toBe(false);
  });
});

describe("computeRankings", () => {
  it("ranks highest current value first", () => {
    const ranks = computeRankings([
      { employeeId: "a", currentValue: 0.3 },
      { employeeId: "b", currentValue: 0.5 },
      { employeeId: "c", currentValue: 0.4 },
    ]);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("a")).toBe(3);
  });
});

describe("computeTeamGoalUpdate", () => {
  it("flags justCompleted only on the transition across the target", () => {
    const crossing = computeTeamGoalUpdate(false, 0.4, 0.41);
    expect(crossing.justCompleted).toBe(true);

    const alreadyDone = computeTeamGoalUpdate(true, 0.4, 0.42);
    expect(alreadyDone.justCompleted).toBe(false);

    const stillShort = computeTeamGoalUpdate(false, 0.4, 0.38);
    expect(stillShort.justCompleted).toBe(false);
  });
});

describe("isChallengeExpired", () => {
  it("is not expired on or before its end date", () => {
    expect(isChallengeExpired("2026-02-10", "2026-02-09")).toBe(false);
    expect(isChallengeExpired("2026-02-10", "2026-02-10")).toBe(false);
  });

  it("is expired the day after its end date", () => {
    expect(isChallengeExpired("2026-02-10", "2026-02-11")).toBe(true);
  });
});
