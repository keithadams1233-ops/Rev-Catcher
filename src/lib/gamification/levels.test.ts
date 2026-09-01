import { describe, it, expect } from "vitest";
import {
  xpForLevel,
  cumulativeXpForLevel,
  deriveLevelFromLifetimeXp,
  levelProgress,
  levelTitle,
  nextStreakMilestone,
  MAX_LEVEL,
} from "./levels";

describe("xpForLevel / cumulativeXpForLevel", () => {
  it("matches spec §15's formula", () => {
    expect(xpForLevel(1)).toBe(600);
    expect(xpForLevel(12)).toBe(1700);
  });

  it("cumulative is the running sum of xpForLevel up to (not including) the target level", () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(2)).toBe(xpForLevel(1));
    expect(cumulativeXpForLevel(3)).toBe(xpForLevel(1) + xpForLevel(2));
  });
});

describe("deriveLevelFromLifetimeXp", () => {
  it("is the exact inverse of cumulativeXpForLevel + currentXp for every seeded employee shape", () => {
    // Round-trip: pick a level/currentXp, derive lifetime, derive back.
    for (const level of [1, 5, 12, 15, 30]) {
      const currentXp = 100;
      const lifetimeXp = cumulativeXpForLevel(level) + currentXp;
      expect(deriveLevelFromLifetimeXp(lifetimeXp)).toEqual({ level, currentXp });
    }
  });

  it("starts at level 1 with 0 XP", () => {
    expect(deriveLevelFromLifetimeXp(0)).toEqual({ level: 1, currentXp: 0 });
  });

  it("advances a level exactly when lifetime XP reaches the next threshold", () => {
    const justBelow = cumulativeXpForLevel(2) - 1;
    const exactly = cumulativeXpForLevel(2);
    expect(deriveLevelFromLifetimeXp(justBelow).level).toBe(1);
    expect(deriveLevelFromLifetimeXp(exactly).level).toBe(2);
  });

  it("never exceeds MAX_LEVEL even with an enormous XP total", () => {
    const result = deriveLevelFromLifetimeXp(10_000_000);
    expect(result.level).toBe(MAX_LEVEL);
    expect(result.currentXp).toBeGreaterThanOrEqual(0);
  });
});

describe("levelProgress", () => {
  it("computes remaining XP and a 0-100 percent", () => {
    const progress = levelProgress(12, 980);
    expect(progress.xpForNextLevel).toBe(1700);
    expect(progress.remainingXp).toBe(720); // matches spec's "720 XP to Level 13" flavor text
    expect(progress.progressPercent).toBeCloseTo((980 / 1700) * 100, 5);
  });

  it("caps progress at 100% rather than overshooting", () => {
    const progress = levelProgress(5, 999_999);
    expect(progress.progressPercent).toBe(100);
    expect(progress.remainingXp).toBe(0);
  });
});

describe("levelTitle", () => {
  it("matches the spec §15 title bands at their boundaries", () => {
    expect(levelTitle(1)).toBe("Rookie");
    expect(levelTitle(4)).toBe("Rookie");
    expect(levelTitle(5)).toBe("Starter");
    expect(levelTitle(12)).toBe("Sales Spark");
    expect(levelTitle(50)).toBe("Legend");
  });
});

describe("nextStreakMilestone", () => {
  it("finds the next multiple of 5 strictly above the current streak", () => {
    expect(nextStreakMilestone(0).day).toBe(5);
    expect(nextStreakMilestone(4).day).toBe(5);
    expect(nextStreakMilestone(5).day).toBe(10);
    expect(nextStreakMilestone(11).day).toBe(15); // matches spec's own 11-day-streak example
  });
});
