import "server-only";

import { createClient } from "@/lib/supabase/server";
import { levelProgress, nextStreakMilestone, type LevelProgress } from "@/lib/gamification/levels";

/**
 * Server-only read layer for the employee (Rev Rewards) screens — same
 * pattern as src/lib/data/manager.ts: plain queries zipped in TS, every
 * function scoped to the caller's own employeeId/organizationId. Employees
 * can only ever read their *own* ledger/mission-progress/redemption rows
 * (RLS enforces this even if a bug here got a query wrong), and read
 * org-visible rows (levels, streaks, badges, challenges, missions) for
 * anyone at their location — never another org's data.
 */

export async function getPointsBalance(employeeId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("point_ledger").select("points").eq("employee_id", employeeId);
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + r.points, 0);
}

export interface PointsHistoryEntry {
  id: string;
  points: number;
  dollarValue: number;
  transactionType: string;
  description: string | null;
  createdAt: string;
}

export async function getPointsHistory(employeeId: string, limit = 50): Promise<PointsHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("point_ledger")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    points: r.points,
    dollarValue: r.dollar_value,
    transactionType: r.transaction_type,
    description: r.description,
    createdAt: r.created_at,
  }));
}

export async function getLevelProgress(employeeId: string): Promise<LevelProgress> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_levels")
    .select("current_level, current_xp")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error) throw error;
  // No row yet (brand-new employee, no XP ever awarded) — level 1, 0 XP.
  return levelProgress(data?.current_level ?? 1, data?.current_xp ?? 0);
}

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  nextMilestoneDay: number;
  nextBonusPoints: number;
}

export async function getStreak(employeeId: string): Promise<StreakSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streaks")
    .select("current_streak, longest_streak")
    .eq("employee_id", employeeId)
    .eq("streak_type", "participation")
    .maybeSingle();

  if (error) throw error;
  const current = data?.current_streak ?? 0;
  const milestone = nextStreakMilestone(current);
  return {
    currentStreak: current,
    longestStreak: data?.longest_streak ?? 0,
    nextMilestoneDay: milestone.day,
    nextBonusPoints: milestone.bonusPoints,
  };
}

export interface ActiveChallengeForEmployee {
  challengeId: string;
  title: string;
  description: string | null;
  metricCode: string;
  endDate: string;
  daysRemaining: number;
  targetValue: number;
  currentValue: number;
  bestValue: number;
  pointsEarned: number;
  rank: number | null;
  tiers: Array<{ id: string; name: string; thresholdValue: number; pointsAwarded: number; reached: boolean }>;
  nextTierPoints: number | null;
  teamGoal: { targetValue: number; currentValue: number; pointsAwardedPerEmployee: number; completed: boolean } | null;
}

/** The employee's own standing in their currently-active challenge, if any. */
export async function getActiveChallengeForEmployee(employeeId: string): Promise<ActiveChallengeForEmployee | null> {
  const supabase = await createClient();

  const { data: participations, error: pError } = await supabase
    .from("challenge_participants")
    .select("*")
    .eq("employee_id", employeeId);

  if (pError) throw pError;
  if (!participations || participations.length === 0) return null;

  const { data: challenges, error: cError } = await supabase
    .from("challenges")
    .select("*")
    .in(
      "id",
      participations.map((p) => p.challenge_id),
    )
    .eq("status", "active");

  if (cError) throw cError;
  const challenge = challenges?.[0];
  if (!challenge) return null;

  const participant = participations.find((p) => p.challenge_id === challenge.id)!;

  const [{ data: tiers, error: tierError }, { data: teamGoal, error: teamGoalError }] = await Promise.all([
    supabase
      .from("challenge_tiers")
      .select("*")
      .eq("challenge_id", challenge.id)
      .order("rank_order", { ascending: true }),
    supabase.from("team_goals").select("*").eq("challenge_id", challenge.id).maybeSingle(),
  ]);

  if (tierError) throw tierError;
  if (teamGoalError) throw teamGoalError;

  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(challenge.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  const tierList = (tiers ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    thresholdValue: t.threshold_value,
    pointsAwarded: t.points_awarded,
    reached: participant.current_value >= t.threshold_value,
  }));
  const nextTier = tierList.find((t) => !t.reached);

  return {
    challengeId: challenge.id,
    title: challenge.title,
    description: challenge.description,
    metricCode: challenge.metric_code,
    endDate: challenge.end_date,
    daysRemaining,
    targetValue: challenge.target_value,
    currentValue: participant.current_value,
    bestValue: participant.best_value,
    pointsEarned: participant.points_earned,
    rank: participant.rank,
    tiers: tierList,
    nextTierPoints: nextTier?.pointsAwarded ?? null,
    teamGoal: teamGoal
      ? {
          targetValue: teamGoal.target_value,
          currentValue: teamGoal.current_value,
          pointsAwardedPerEmployee: teamGoal.points_awarded_per_employee,
          completed: teamGoal.completed,
        }
      : null,
  };
}

export interface LeaderboardEntry {
  employeeId: string;
  name: string;
  currentValue: number;
  pointsEarned: number;
  rank: number | null;
  isYou: boolean;
}

export async function getLeaderboard(challengeId: string, viewerEmployeeId: string): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();

  const { data: participants, error } = await supabase
    .from("challenge_participants")
    .select("employee_id, current_value, points_earned, rank")
    .eq("challenge_id", challengeId)
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) throw error;
  if (!participants || participants.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in(
      "id",
      participants.map((p) => p.employee_id),
    );

  if (profileError) throw profileError;
  const names = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim() || p.email]));

  return participants.map((p) => ({
    employeeId: p.employee_id,
    name: names.get(p.employee_id) ?? "Unknown",
    currentValue: p.current_value,
    pointsEarned: p.points_earned,
    rank: p.rank,
    isYou: p.employee_id === viewerEmployeeId,
  }));
}

export interface EmployeeMission {
  id: string;
  title: string;
  description: string | null;
  targetValue: number;
  rewardType: "xp" | "points";
  rewardAmount: number;
  currentValue: number;
  completed: boolean;
}

export async function getDailyMissions(employeeId: string, locationIds: string[]): Promise<EmployeeMission[]> {
  if (locationIds.length === 0) return [];

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: missions, error } = await supabase
    .from("daily_missions")
    .select("*")
    .in("location_id", locationIds)
    .eq("active_date", today);

  if (error) throw error;
  if (!missions || missions.length === 0) return [];

  const { data: progress, error: progressError } = await supabase
    .from("employee_mission_progress")
    .select("*")
    .eq("employee_id", employeeId)
    .in(
      "mission_id",
      missions.map((m) => m.id),
    );

  if (progressError) throw progressError;
  const progressByMission = new Map((progress ?? []).map((p) => [p.mission_id, p]));

  return missions.map((m) => {
    const p = progressByMission.get(m.id);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      targetValue: m.target_value,
      rewardType: m.reward_type,
      rewardAmount: m.reward_amount,
      currentValue: p?.current_value ?? 0,
      completed: p?.completed ?? false,
    };
  });
}

export interface EarnedBadge {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  earnedAt: string;
}

export async function getBadges(employeeId: string): Promise<EarnedBadge[]> {
  const supabase = await createClient();

  const { data: earned, error } = await supabase
    .from("employee_badges")
    .select("badge_id, earned_at")
    .eq("employee_id", employeeId)
    .order("earned_at", { ascending: false });

  if (error) throw error;
  if (!earned || earned.length === 0) return [];

  const { data: badges, error: badgeError } = await supabase
    .from("badges")
    .select("id, code, name, description, icon")
    .in(
      "id",
      earned.map((e) => e.badge_id),
    );

  if (badgeError) throw badgeError;
  const badgeById = new Map((badges ?? []).map((b) => [b.id, b]));

  return earned
    .map((e) => {
      const badge = badgeById.get(e.badge_id);
      if (!badge) return null;
      return {
        code: badge.code,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        earnedAt: e.earned_at,
      };
    })
    .filter((b): b is EarnedBadge => b !== null);
}

export interface EmployeeLocation {
  id: string;
  name: string;
}

export async function getEmployeeLocations(employeeId: string): Promise<EmployeeLocation[]> {
  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from("employee_locations")
    .select("location_id")
    .eq("employee_id", employeeId);

  if (error) throw error;
  const locationIds = (links ?? []).map((l) => l.location_id);
  if (locationIds.length === 0) return [];

  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, name")
    .in("id", locationIds);

  if (locError) throw locError;
  return locations ?? [];
}

export interface LatestNotification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
}

export async function getLatestUnreadNotification(employeeId: string): Promise<LatestNotification | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, link, created_at")
    .eq("user_id", employeeId)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { id: data.id, title: data.title, body: data.body, link: data.link, createdAt: data.created_at };
}

export interface MyRedemption {
  id: string;
  rewardName: string;
  pointsSpent: number;
  dollarValue: number;
  status: string;
  redeemedAt: string;
}

export async function getMyRedemptions(employeeId: string): Promise<MyRedemption[]> {
  const supabase = await createClient();
  const { data: redemptions, error } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("employee_id", employeeId)
    .order("redeemed_at", { ascending: false });

  if (error) throw error;
  if (!redemptions || redemptions.length === 0) return [];

  const { data: catalog, error: catalogError } = await supabase
    .from("reward_catalog")
    .select("id, name")
    .in(
      "id",
      redemptions.map((r) => r.reward_id),
    );

  if (catalogError) throw catalogError;
  const namesById = new Map((catalog ?? []).map((c) => [c.id, c.name]));

  return redemptions.map((r) => ({
    id: r.id,
    rewardName: namesById.get(r.reward_id) ?? "Reward",
    pointsSpent: r.points_spent,
    dollarValue: r.dollar_value,
    status: r.status,
    redeemedAt: r.redeemed_at,
  }));
}
