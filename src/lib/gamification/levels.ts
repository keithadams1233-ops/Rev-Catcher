/**
 * Deterministic leveling math (spec §15). Shared by the seed script and the
 * employee UI so a seeded employee_levels row and the progress bar that
 * renders it can never disagree about what "next level" means.
 *
 * The spec gives two numbers that don't reconcile literally: the formula
 * ("XP needed for next level = 500 + (level × 100)") and a flavor-text
 * mockup ("Level 12 ... 4,280 / 5,000 XP, 720 XP to Level 13" — 500+12×100
 * is 1,700, not 5,000). The formula is stated as the rule ("simple formula
 * is acceptable"); the mockup numbers are illustrative UI copy, not a
 * literal seed target. This implementation takes the formula as
 * authoritative — seed data is chosen to satisfy it exactly.
 */

export const MAX_LEVEL = 50;

/** XP required to advance from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return 500 + level * 100;
}

/** Total XP needed to reach `level` starting from level 1 at 0 XP. */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

/**
 * The inverse of `cumulativeXpForLevel`: given a lifetime XP total (the
 * `xp_ledger` sum for an employee), finds the level/current-XP pair it
 * corresponds to. This is what keeps `employee_levels` a true derivation
 * of `xp_ledger` rather than an independently-maintained number (CLAUDE.md
 * rule #2) — whenever new XP is awarded, the gamification job recomputes
 * `employee_levels` from the ledger's new total via this function, never
 * by incrementing `current_xp` in place.
 */
export function deriveLevelFromLifetimeXp(lifetimeXp: number): { level: number; currentXp: number } {
  let level = 1;
  let consumed = 0;

  while (level < MAX_LEVEL) {
    const needed = xpForLevel(level);
    if (consumed + needed > lifetimeXp) break;
    consumed += needed;
    level += 1;
  }

  return { level, currentXp: lifetimeXp - consumed };
}

export interface LevelProgress {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  remainingXp: number;
  progressPercent: number;
  title: string;
}

export function levelProgress(level: number, currentXp: number): LevelProgress {
  const capped = Math.min(level, MAX_LEVEL);
  const xpForNextLevel = xpForLevel(capped);
  return {
    level: capped,
    currentXp,
    xpForNextLevel,
    remainingXp: Math.max(xpForNextLevel - currentXp, 0),
    progressPercent: Math.min((currentXp / xpForNextLevel) * 100, 100),
    title: levelTitle(capped),
  };
}

const TITLE_BANDS: Array<{ max: number; title: string }> = [
  { max: 4, title: "Rookie" },
  { max: 9, title: "Starter" },
  { max: 14, title: "Sales Spark" },
  { max: 19, title: "Momentum Maker" },
  { max: 29, title: "Revenue Runner" },
  { max: 39, title: "Growth Pro" },
  { max: 49, title: "Elite Performer" },
  { max: 50, title: "Legend" },
];

export function levelTitle(level: number): string {
  return TITLE_BANDS.find((band) => level <= band.max)?.title ?? "Legend";
}

/**
 * Streak bonus (spec §11: "11-day streak, Next bonus: +250 points").
 * Simple milestone rule: every 5th consecutive qualifying day earns a flat
 * 250-point bonus.
 */
export const STREAK_MILESTONE_INTERVAL = 5;
export const STREAK_MILESTONE_BONUS_POINTS = 250;

export function nextStreakMilestone(currentStreak: number): { day: number; bonusPoints: number } {
  const day = (Math.floor(currentStreak / STREAK_MILESTONE_INTERVAL) + 1) * STREAK_MILESTONE_INTERVAL;
  return { day, bonusPoints: STREAK_MILESTONE_BONUS_POINTS };
}
