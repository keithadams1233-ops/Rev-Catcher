import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendNotification, sendNotifications, type ServiceClient } from "@/lib/gamification/notify";
import { computeParticipantUpdate, computeRankings, computeTeamGoalUpdate, isChallengeExpired } from "./progress";

export interface ProgressUpdateSummary {
  challengesChecked: number;
  participantsUpdated: number;
  tiersAwarded: number;
  teamGoalsCompleted: number;
  challengesCompleted: number;
}

/**
 * Spec §7 build order: "progress updates, rankings, challenge completion."
 * Reads each active challenge's participants' own latest employee-level
 * `metric_snapshot` (written by the Phase 4 engine) and updates
 * `challenge_participants`/`team_goals`/`challenges` from it — the piece
 * Phase 2's goal builder couldn't build yet because no metric engine
 * existed to feed it. Called at the end of a successful CSV import (spec
 * §19 step 9, closing out that whole list) and from a manual "Update
 * Progress" action on a challenge's detail page.
 *
 * Points for crossing a challenge tier or completing a team goal are
 * awarded here, not deferred to Phase 8 — a challenge's tiers *are*
 * point rewards (`challenge_tiers.points_awarded`), so "progress
 * updates" for a challenge inherently means awarding them. Phase 8 adds
 * the matching notifications (`points_earned`, `team_goal_progress`,
 * `challenge_completed`) through the shared `notify.ts` helper, on the
 * same three crossing events this module already detects — XP, streaks,
 * missions, and badges are still entirely Phase 8's own
 * (`src/lib/gamification/update-gamification.ts`), not this one.
 */
export async function updateChallengeProgress(organizationId: string): Promise<ProgressUpdateSummary> {
  const supabase = createServiceRoleClient();
  const summary: ProgressUpdateSummary = {
    challengesChecked: 0,
    participantsUpdated: 0,
    tiersAwarded: 0,
    teamGoalsCompleted: 0,
    challengesCompleted: 0,
  };

  const { data: challenges, error: challengesError } = await supabase
    .from("challenges")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (challengesError) throw challengesError;
  if (!challenges || challenges.length === 0) return summary;

  const today = new Date().toISOString().slice(0, 10);

  for (const challenge of challenges) {
    summary.challengesChecked += 1;

    const [{ data: tiers, error: tiersError }, { data: participants, error: participantsError }] = await Promise.all([
      supabase
        .from("challenge_tiers")
        .select("id, threshold_value, points_awarded")
        .eq("challenge_id", challenge.id)
        .order("rank_order", { ascending: true }),
      supabase.from("challenge_participants").select("*").eq("challenge_id", challenge.id),
    ]);
    if (tiersError) throw tiersError;
    if (participantsError) throw participantsError;

    const tierList = (tiers ?? []).map((t) => ({
      id: t.id,
      thresholdValue: t.threshold_value,
      pointsAwarded: t.points_awarded,
    }));

    const updatedValues: Array<{ employeeId: string; currentValue: number }> = [];

    for (const participant of participants ?? []) {
      const { data: snapshot, error: snapshotError } = await supabase
        .from("metric_snapshots")
        .select("value")
        .eq("organization_id", organizationId)
        .eq("location_id", challenge.location_id)
        .eq("employee_id", participant.employee_id)
        .eq("metric_code", challenge.metric_code)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapshotError) throw snapshotError;

      // No new data for this employee yet — leave their row untouched
      // rather than overwriting real progress with a stale re-read.
      if (!snapshot) {
        updatedValues.push({ employeeId: participant.employee_id, currentValue: participant.current_value });
        continue;
      }

      const update = computeParticipantUpdate(
        participant.best_value,
        participant.points_earned,
        snapshot.value,
        tierList,
      );

      for (const tier of update.newlyCrossedTiers) {
        const awarded = await insertPointLedgerIfMissing(supabase, {
          organizationId,
          employeeId: participant.employee_id,
          sourceType: "challenge_tier",
          sourceId: tier.id,
          points: tier.pointsAwarded,
          description: `${challenge.title} — tier reached`,
        });
        if (awarded) {
          summary.tiersAwarded += 1;
          await sendNotification(supabase, {
            organizationId,
            userId: participant.employee_id,
            type: "points_earned",
            title: `+${tier.pointsAwarded} points — ${challenge.title}`,
            body: "You reached a new tier. Keep it up!",
            link: "/employee/points",
          });
        }
      }

      const { error: updateError } = await supabase
        .from("challenge_participants")
        .update({
          current_value: update.currentValue,
          best_value: update.bestValue,
          points_earned: update.pointsEarned,
          completed: update.completed,
        })
        .eq("id", participant.id);
      if (updateError) throw updateError;

      summary.participantsUpdated += 1;
      updatedValues.push({ employeeId: participant.employee_id, currentValue: update.currentValue });
    }

    const rankings = computeRankings(updatedValues);
    for (const participant of participants ?? []) {
      const rank = rankings.get(participant.employee_id);
      if (rank !== undefined && rank !== participant.rank) {
        const { error: rankError } = await supabase
          .from("challenge_participants")
          .update({ rank })
          .eq("id", participant.id);
        if (rankError) throw rankError;
      }
    }

    const { data: teamGoal, error: teamGoalError } = await supabase
      .from("team_goals")
      .select("*")
      .eq("challenge_id", challenge.id)
      .maybeSingle();
    if (teamGoalError) throw teamGoalError;

    if (teamGoal) {
      const { data: locationSnapshot, error: locSnapshotError } = await supabase
        .from("metric_snapshots")
        .select("value")
        .eq("organization_id", organizationId)
        .eq("location_id", challenge.location_id)
        .is("employee_id", null)
        .eq("metric_code", challenge.metric_code)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (locSnapshotError) throw locSnapshotError;

      if (locationSnapshot) {
        const teamUpdate = computeTeamGoalUpdate(teamGoal.completed, teamGoal.target_value, locationSnapshot.value);

        const { error: teamUpdateError } = await supabase
          .from("team_goals")
          .update({ current_value: teamUpdate.currentValue, completed: teamUpdate.justCompleted || teamGoal.completed })
          .eq("id", teamGoal.id);
        if (teamUpdateError) throw teamUpdateError;

        if (teamUpdate.justCompleted) {
          summary.teamGoalsCompleted += 1;
          for (const participant of participants ?? []) {
            await insertPointLedgerIfMissing(supabase, {
              organizationId,
              employeeId: participant.employee_id,
              sourceType: "team_goal",
              sourceId: teamGoal.id,
              points: teamGoal.points_awarded_per_employee,
              description: `${challenge.title} — team goal reached`,
            });
          }
          await sendNotifications(
            supabase,
            (participants ?? []).map((participant) => ({
              organizationId,
              userId: participant.employee_id,
              type: "team_goal_progress" as const,
              title: `Team goal reached — ${challenge.title}`,
              body: `Everyone earned +${teamGoal.points_awarded_per_employee} points.`,
              link: "/employee",
            })),
          );
        }
      }
    }

    if (isChallengeExpired(challenge.end_date, today)) {
      const { error: completeError } = await supabase
        .from("challenges")
        .update({ status: "completed" })
        .eq("id", challenge.id);
      if (completeError) throw completeError;
      summary.challengesCompleted += 1;

      await sendNotifications(
        supabase,
        (participants ?? []).map((participant) => {
          const finalRank = rankings.get(participant.employee_id);
          return {
            organizationId,
            userId: participant.employee_id,
            type: "challenge_completed" as const,
            title: `${challenge.title} is complete`,
            body: finalRank ? `You finished ranked #${finalRank}.` : "See how you did.",
            link: `/employee`,
          };
        }),
      );
    }
  }

  return summary;
}

/** Same idempotency pattern as scripts/seed.ts's ledger helpers — the
 * partial unique index on (employee_id, source_type, source_id) is the
 * backstop; this existence check is what makes a re-run of this whole
 * job a no-op for already-awarded tiers instead of a constraint error. */
async function insertPointLedgerIfMissing(
  supabase: ServiceClient,
  entry: {
    organizationId: string;
    employeeId: string;
    sourceType: string;
    sourceId: string;
    points: number;
    description: string;
  },
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
