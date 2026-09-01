import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { DEFAULT_ATTACHMENT_RULES } from "@/lib/metrics";
import { toEngineTransactions } from "@/lib/metrics/from-db";
import { byEmployee } from "@/lib/metrics/aggregate";
import type { AttachmentMetricCode } from "@/lib/metrics";
import { computeMissionProgress } from "./mission-progress";
import { deriveLevelFromLifetimeXp, levelTitle } from "./levels";
import { evaluateNewBadges, type BadgeDefinition, type BadgeEvaluationState } from "./badges";
import { sendNotification } from "./notify";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export interface GamificationUpdateSummary {
  missionsEvaluated: number;
  missionsCompleted: number;
  xpAwarded: number;
  pointsAwarded: number;
  levelsGained: number;
  streaksAdvanced: number;
  badgesAwarded: number;
}

const STREAK_TYPE = "participation";

/**
 * Spec §12/§15 build order: mission progress -> XP/points -> level
 * recalculation -> streaks -> badges -> notifications, in that order
 * because badges (level_reached, streak_days, missions_completed) need
 * this run's own level/streak/mission results, not yesterday's.
 *
 * Documented scope, same discipline as every other engine in this app:
 * - Only missions whose `metric_code` is one of the four attachment
 *   metrics are auto-tracked. A rank-based mission (`metric_code: null`,
 *   e.g. "Climb One Spot") has no leaderboard-history infra to diff
 *   against, and `average_ticket`/`loyalty_enrollment` missions have no
 *   defined target semantics in the spec's own mission examples — both
 *   are left for a manager/employee to resolve manually, same as
 *   Phase 7's rank-based challenge tiers before this.
 * - Streak/mission processing looks at *today's* transactions only, not a
 *   historical backfill across every date a CSV import might contain —
 *   consistent with "daily" mission semantics (`active_date`), and with
 *   Phase 7's participant updates only ever reading the *latest* snapshot.
 * - Streak milestone bonus points (`nextStreakMilestone`, +250 every 5th
 *   day) are surfaced as UI flavor text only, never auto-awarded here:
 *   unlike a mission or a challenge tier, a streak milestone has no
 *   natural per-occurrence row to key `point_ledger`'s idempotency off —
 *   `streaks` is a single mutable row per employee, not a ledger of
 *   individual streak-days. Faking a `source_id` for it would be a
 *   fragile hack, not a real idempotency guarantee, so it's left out
 *   rather than built unsafely.
 * - `leaderboard_change` notifications are skipped: with no persisted
 *   rank history, "changed" can't be detected without adding exactly the
 *   kind of infrastructure the rank-mission cut above already decided not
 *   to build for this phase.
 * - Badge criteria are evaluated for every employee in the org on every
 *   run (org sizes here are pilot/demo scale — dozens, not thousands),
 *   not just employees this run's missions/streaks touched, because a
 *   `challenge_rank_max` badge can newly qualify from a challenge
 *   completing with no mission or streak activity that day at all.
 */
export async function updateGamification(organizationId: string): Promise<GamificationUpdateSummary> {
  const supabase = createServiceRoleClient();
  const summary: GamificationUpdateSummary = {
    missionsEvaluated: 0,
    missionsCompleted: 0,
    xpAwarded: 0,
    pointsAwarded: 0,
    levelsGained: 0,
    streaksAdvanced: 0,
    badgesAwarded: 0,
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayStart = `${today}T00:00:00.000Z`;
  const tomorrowStart = new Date(Date.parse(todayStart) + 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(Date.parse(todayStart) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const xpTouchedEmployeeIds = new Set<string>();

  // ---- 1. Daily mission progress + XP/points ----
  const { data: missions, error: missionsError } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active_date", today);
  if (missionsError) throw missionsError;

  for (const mission of missions ?? []) {
    if (!mission.metric_code || !(mission.metric_code in DEFAULT_ATTACHMENT_RULES)) continue;
    summary.missionsEvaluated += 1;

    const { data: txnRows, error: txnError } = await supabase
      .from("transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("location_id", mission.location_id)
      .gte("transaction_timestamp", todayStart)
      .lt("transaction_timestamp", tomorrowStart);
    if (txnError) throw txnError;
    if (!txnRows || txnRows.length === 0) continue;

    const { data: itemRows, error: itemError } = await supabase
      .from("transaction_items")
      .select("*")
      .in("transaction_id", txnRows.map((t) => t.id));
    if (itemError) throw itemError;

    const employeeTxnGroups = byEmployee(toEngineTransactions(txnRows, itemRows ?? []));

    for (const [employeeId, employeeTxns] of employeeTxnGroups) {
      const progress = computeMissionProgress(
        mission.metric_code as AttachmentMetricCode,
        mission.target_value,
        employeeTxns,
      );

      const { data: existing, error: selectError } = await supabase
        .from("employee_mission_progress")
        .select("*")
        .eq("mission_id", mission.id)
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (selectError) throw selectError;

      const wasCompleted = existing?.completed ?? false;

      if (existing) {
        const { error } = await supabase
          .from("employee_mission_progress")
          .update({ current_value: progress.currentValue, completed: progress.completed })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employee_mission_progress").insert({
          mission_id: mission.id,
          employee_id: employeeId,
          current_value: progress.currentValue,
          completed: progress.completed,
        });
        if (error) throw error;
      }

      if (progress.completed && !wasCompleted) summary.missionsCompleted += 1;

      const rewardAlreadyIssued = existing?.reward_issued ?? false;
      if (!progress.completed || rewardAlreadyIssued) continue;

      const awarded =
        mission.reward_type === "xp"
          ? await awardXp(supabase, {
              organizationId,
              employeeId,
              sourceType: "daily_mission",
              sourceId: mission.id,
              xp: mission.reward_amount,
              description: `${mission.title} — mission completed`,
            })
          : await awardPoints(supabase, {
              organizationId,
              employeeId,
              sourceType: "daily_mission",
              sourceId: mission.id,
              points: mission.reward_amount,
              description: `${mission.title} — mission completed`,
            });
      if (!awarded) continue; // already awarded by a prior run (ledger idempotency)

      if (mission.reward_type === "xp") {
        xpTouchedEmployeeIds.add(employeeId);
        summary.xpAwarded += 1;
      } else {
        summary.pointsAwarded += 1;
      }

      const { error: flagError } = await supabase
        .from("employee_mission_progress")
        .update({ reward_issued: true })
        .eq("mission_id", mission.id)
        .eq("employee_id", employeeId);
      if (flagError) throw flagError;

      await sendNotification(supabase, {
        organizationId,
        userId: employeeId,
        type: "mission_completed",
        title: `Mission complete: ${mission.title}`,
        body: `You earned ${mission.reward_amount} ${mission.reward_type === "xp" ? "XP" : "points"}.`,
        link: "/employee/missions",
      });
    }
  }

  // ---- 2. Level recalculation for every employee who earned XP above ----
  for (const employeeId of xpTouchedEmployeeIds) {
    const { data: xpRows, error: xpSumError } = await supabase
      .from("xp_ledger")
      .select("xp")
      .eq("employee_id", employeeId);
    if (xpSumError) throw xpSumError;

    const lifetimeXp = (xpRows ?? []).reduce((sum, r) => sum + r.xp, 0);
    const derived = deriveLevelFromLifetimeXp(lifetimeXp);

    const { data: existingLevel, error: levelSelectError } = await supabase
      .from("employee_levels")
      .select("*")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (levelSelectError) throw levelSelectError;

    const previousLevel = existingLevel?.current_level ?? 1;

    if (existingLevel) {
      const { error } = await supabase
        .from("employee_levels")
        .update({ current_level: derived.level, current_xp: derived.currentXp, lifetime_xp: lifetimeXp })
        .eq("id", existingLevel.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("employee_levels").insert({
        employee_id: employeeId,
        current_level: derived.level,
        current_xp: derived.currentXp,
        lifetime_xp: lifetimeXp,
      });
      if (error) throw error;
    }

    if (derived.level > previousLevel) {
      summary.levelsGained += 1;
      await sendNotification(supabase, {
        organizationId,
        userId: employeeId,
        type: "level_up",
        title: `Level up! You reached level ${derived.level}.`,
        body: `${levelTitle(derived.level)} — keep it going.`,
        link: "/employee",
      });
    }
  }

  // ---- 3. Streaks (today only — no historical backfill) ----
  const { data: todayTxns, error: todayTxnsError } = await supabase
    .from("transactions")
    .select("employee_id, voided, refund_amount")
    .eq("organization_id", organizationId)
    .gte("transaction_timestamp", todayStart)
    .lt("transaction_timestamp", tomorrowStart);
  if (todayTxnsError) throw todayTxnsError;

  const qualifyingEmployeeIds = new Set(
    (todayTxns ?? [])
      .filter((t) => !t.voided && t.refund_amount === 0 && t.employee_id)
      .map((t) => t.employee_id as string),
  );

  for (const employeeId of qualifyingEmployeeIds) {
    const { data: existingStreak, error: streakSelectError } = await supabase
      .from("streaks")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("streak_type", STREAK_TYPE)
      .maybeSingle();
    if (streakSelectError) throw streakSelectError;

    if (existingStreak?.last_qualified_date === today) continue; // already processed this run

    const continuing = existingStreak?.last_qualified_date === yesterday;
    const nextStreak = continuing ? existingStreak!.current_streak + 1 : 1;
    const nextLongest = Math.max(nextStreak, existingStreak?.longest_streak ?? 0);

    if (existingStreak) {
      const { error } = await supabase
        .from("streaks")
        .update({ current_streak: nextStreak, longest_streak: nextLongest, last_qualified_date: today })
        .eq("id", existingStreak.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("streaks").insert({
        employee_id: employeeId,
        streak_type: STREAK_TYPE,
        current_streak: nextStreak,
        longest_streak: nextLongest,
        last_qualified_date: today,
      });
      if (error) throw error;
    }

    summary.streaksAdvanced += 1;
  }

  // ---- 4. Badges, org-wide, data-driven against badges.criteria_type ----
  const { data: employees, error: employeesError } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("role", "employee");
  if (employeesError) throw employeesError;

  const employeeIds = (employees ?? []).map((e) => e.id);
  if (employeeIds.length === 0) return summary;

  const [
    { data: badgeRows, error: badgeRowsError },
    { data: levelRows, error: levelRowsError },
    { data: streakRows, error: streakRowsError },
    { data: missionProgressRows, error: missionProgressRowsError },
    { data: teamGoalLedgerRows, error: teamGoalLedgerRowsError },
    { data: completedChallenges, error: completedChallengesError },
    { data: earnedBadgeRows, error: earnedBadgeRowsError },
  ] = await Promise.all([
    supabase.from("badges").select("*"),
    supabase.from("employee_levels").select("employee_id, current_level").in("employee_id", employeeIds),
    supabase
      .from("streaks")
      .select("employee_id, current_streak")
      .eq("streak_type", STREAK_TYPE)
      .in("employee_id", employeeIds),
    supabase
      .from("employee_mission_progress")
      .select("employee_id, completed")
      .eq("completed", true)
      .in("employee_id", employeeIds),
    supabase.from("point_ledger").select("employee_id, source_id").eq("source_type", "team_goal").in("employee_id", employeeIds),
    supabase.from("challenges").select("id").eq("organization_id", organizationId).eq("status", "completed"),
    supabase.from("employee_badges").select("employee_id, badge_id").in("employee_id", employeeIds),
  ]);
  if (badgeRowsError) throw badgeRowsError;
  if (levelRowsError) throw levelRowsError;
  if (streakRowsError) throw streakRowsError;
  if (missionProgressRowsError) throw missionProgressRowsError;
  if (teamGoalLedgerRowsError) throw teamGoalLedgerRowsError;
  if (completedChallengesError) throw completedChallengesError;
  if (earnedBadgeRowsError) throw earnedBadgeRowsError;

  const completedChallengeIds = (completedChallenges ?? []).map((c) => c.id);
  const bestRankByEmployee = new Map<string, number>();
  if (completedChallengeIds.length > 0) {
    const { data: participantRows, error: participantError } = await supabase
      .from("challenge_participants")
      .select("employee_id, rank")
      .in("challenge_id", completedChallengeIds)
      .in("employee_id", employeeIds);
    if (participantError) throw participantError;

    for (const row of participantRows ?? []) {
      if (row.rank === null) continue;
      const current = bestRankByEmployee.get(row.employee_id);
      if (current === undefined || row.rank < current) bestRankByEmployee.set(row.employee_id, row.rank);
    }
  }

  const levelByEmployee = new Map((levelRows ?? []).map((r) => [r.employee_id, r.current_level]));
  const streakByEmployee = new Map((streakRows ?? []).map((r) => [r.employee_id, r.current_streak]));

  const missionCountByEmployee = new Map<string, number>();
  for (const row of missionProgressRows ?? []) {
    missionCountByEmployee.set(row.employee_id, (missionCountByEmployee.get(row.employee_id) ?? 0) + 1);
  }

  const teamGoalIdsByEmployee = new Map<string, Set<string>>();
  for (const row of teamGoalLedgerRows ?? []) {
    if (!row.source_id) continue;
    const set = teamGoalIdsByEmployee.get(row.employee_id) ?? new Set<string>();
    set.add(row.source_id);
    teamGoalIdsByEmployee.set(row.employee_id, set);
  }

  const badgeById = new Map((badgeRows ?? []).map((b) => [b.id, b]));
  const definitions: BadgeDefinition[] = (badgeRows ?? []).map((b) => ({
    code: b.code,
    criteriaType: b.criteria_type,
    criteriaValue: b.criteria_value,
  }));

  const earnedCodesByEmployee = new Map<string, Set<string>>();
  for (const row of earnedBadgeRows ?? []) {
    const badge = badgeById.get(row.badge_id);
    if (!badge) continue;
    const set = earnedCodesByEmployee.get(row.employee_id) ?? new Set<string>();
    set.add(badge.code);
    earnedCodesByEmployee.set(row.employee_id, set);
  }

  for (const employeeId of employeeIds) {
    const state: BadgeEvaluationState = {
      currentLevel: levelByEmployee.get(employeeId) ?? 1,
      currentStreak: streakByEmployee.get(employeeId) ?? 0,
      completedMissionCount: missionCountByEmployee.get(employeeId) ?? 0,
      teamGoalsCompletedCount: teamGoalIdsByEmployee.get(employeeId)?.size ?? 0,
      bestChallengeRank: bestRankByEmployee.get(employeeId) ?? null,
    };

    const newCodes = evaluateNewBadges(definitions, state, earnedCodesByEmployee.get(employeeId) ?? new Set());
    if (newCodes.length === 0) continue;

    for (const code of newCodes) {
      const badge = (badgeRows ?? []).find((b) => b.code === code);
      if (!badge) continue;

      const { error } = await supabase.from("employee_badges").insert({ employee_id: employeeId, badge_id: badge.id });
      if (error) throw error;
      summary.badgesAwarded += 1;

      // No dedicated "badge earned" notification_type in the spec's enum —
      // "reward_unlocked" is the closest fit (a badge is itself an
      // unlockable, distinct from a reward_catalog redemption).
      await sendNotification(supabase, {
        organizationId,
        userId: employeeId,
        type: "reward_unlocked",
        title: `Badge unlocked: ${badge.name}`,
        body: badge.description ?? undefined,
        link: "/employee",
      });
    }
  }

  return summary;
}

/** Same idempotency pattern as update-progress.ts's point-ledger helper. */
async function awardPoints(
  supabase: ServiceClient,
  entry: { organizationId: string; employeeId: string; sourceType: string; sourceId: string; points: number; description: string },
): Promise<boolean> {
  const { data: existing, error: selectError } = await supabase
    .from("point_ledger")
    .select("id")
    .eq("employee_id", entry.employeeId)
    .eq("source_type", entry.sourceType)
    .eq("source_id", entry.sourceId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return false;

  const { error } = await supabase.from("point_ledger").insert({
    organization_id: entry.organizationId,
    employee_id: entry.employeeId,
    transaction_type: "earn",
    source_type: entry.sourceType,
    source_id: entry.sourceId,
    points: entry.points,
    dollar_value: entry.points / 100,
    description: entry.description,
  });
  if (error) throw error;
  return true;
}

/** Mirrors `awardPoints`, but against `xp_ledger`'s narrower column set. */
async function awardXp(
  supabase: ServiceClient,
  entry: { organizationId: string; employeeId: string; sourceType: string; sourceId: string; xp: number; description: string },
): Promise<boolean> {
  const { data: existing, error: selectError } = await supabase
    .from("xp_ledger")
    .select("id")
    .eq("employee_id", entry.employeeId)
    .eq("source_type", entry.sourceType)
    .eq("source_id", entry.sourceId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return false;

  const { error } = await supabase.from("xp_ledger").insert({
    organization_id: entry.organizationId,
    employee_id: entry.employeeId,
    source_type: entry.sourceType,
    source_id: entry.sourceId,
    xp: entry.xp,
    description: entry.description,
  });
  if (error) throw error;
  return true;
}
