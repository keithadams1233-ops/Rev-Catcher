import Link from "next/link";
import { Trophy, Wallet, Flame } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import {
  getLevelProgress,
  getPointsBalance,
  getStreak,
  getActiveChallengeForEmployee,
  getDailyMissions,
  getEmployeeLocations,
  getBadges,
  getLatestUnreadNotification,
} from "@/lib/data/employee";
import { formatCurrency } from "@/lib/format";
import { StatTile } from "@/components/rewards/stat-tile";
import { RewardsProgressBar } from "@/components/rewards/progress-bar";
import { ChallengeCard } from "@/components/rewards/challenge-card";
import { MissionCard } from "@/components/rewards/mission-card";
import { BadgePill } from "@/components/rewards/badge-pill";
import { PhaseStub } from "@/components/phase-stub";

export default async function EmployeeHomePage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <PhaseStub
        title="No organization assigned"
        description="This account isn't linked to an organization yet. Ask your manager to assign one."
        accent="rewards"
      />
    );
  }

  const locations = await getEmployeeLocations(profile.id);

  const [level, points, streak, challenge, missions, badges, notification] = await Promise.all([
    getLevelProgress(profile.id),
    getPointsBalance(profile.id),
    getStreak(profile.id),
    getActiveChallengeForEmployee(profile.id),
    getDailyMissions(
      profile.id,
      locations.map((l) => l.id),
    ),
    getBadges(profile.id),
    getLatestUnreadNotification(profile.id),
  ]);

  const dollarValue = points / 100;

  return (
    <div className="space-y-5">
      {notification && (
        <Link
          href={notification.link ?? "/employee"}
          className="block rounded-2xl border border-rewards-pink/40 bg-rewards-pink/10 px-4 py-3"
        >
          <p className="text-sm font-semibold text-rewards-text">{notification.title}</p>
          {notification.body && <p className="mt-0.5 text-xs text-rewards-muted">{notification.body}</p>}
        </Link>
      )}

      <section className="grid grid-cols-3 gap-2.5">
        <StatTile icon={Trophy} label={level.title} value={`Lvl ${level.level}`} accent="purple" />
        <StatTile
          icon={Wallet}
          label="Points"
          value={points.toLocaleString()}
          sub={formatCurrency(dollarValue)}
          accent="gold"
        />
        <StatTile
          icon={Flame}
          label="Streak"
          value={`${streak.currentStreak}d`}
          sub={`+${streak.nextBonusPoints} at day ${streak.nextMilestoneDay}`}
          accent="pink"
        />
      </section>

      <section className="rounded-2xl border border-rewards-border bg-rewards-surface p-4">
        <div className="flex items-center justify-between text-xs text-rewards-muted">
          <span>
            {level.currentXp.toLocaleString()} / {level.xpForNextLevel.toLocaleString()} XP
          </span>
          <span>{level.remainingXp.toLocaleString()} XP to next level</span>
        </div>
        <div className="mt-1.5">
          <RewardsProgressBar percent={level.progressPercent} gradient="from-rewards-purple to-rewards-blue" />
        </div>
      </section>

      {challenge ? (
        <ChallengeCard challenge={challenge} />
      ) : (
        <p className="rounded-2xl border border-dashed border-rewards-border p-4 text-center text-sm text-rewards-muted">
          No active challenge right now — check back soon.
        </p>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-rewards-muted">Daily missions</h2>
          {missions.length > 0 && (
            <Link href="/employee/missions" className="text-xs font-medium text-rewards-pink hover:underline">
              See all
            </Link>
          )}
        </div>
        {missions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rewards-border p-4 text-center text-sm text-rewards-muted">
            No missions today — check back tomorrow.
          </p>
        ) : (
          <div className="space-y-2">
            {missions.slice(0, 3).map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
          </div>
        )}
      </section>

      {badges.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-rewards-muted">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <BadgePill key={b.code} badge={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
