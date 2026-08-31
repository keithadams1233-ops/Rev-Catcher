import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getActiveChallengeForEmployee, getLeaderboard } from "@/lib/data/employee";
import { RewardsProgressBar } from "@/components/rewards/progress-bar";
import { formatMetricValue, formatPercent, isDollarMetric } from "@/lib/format";
import { PhaseStub } from "@/components/phase-stub";

export default async function RanksPage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <PhaseStub
        title="No organization assigned"
        description="This account isn't linked to an organization yet."
        accent="rewards"
      />
    );
  }

  const challenge = await getActiveChallengeForEmployee(profile.id);

  if (!challenge) {
    return (
      <p className="rounded-2xl border border-dashed border-rewards-border p-6 text-center text-sm text-rewards-muted">
        No active challenge to rank on right now.
      </p>
    );
  }

  const leaderboard = await getLeaderboard(challenge.challengeId, profile.id);
  const dollar = isDollarMetric(challenge.metricCode);
  const you = leaderboard.find((e) => e.isYou);
  const youIndex = leaderboard.findIndex((e) => e.isYou);
  const aheadOfYou = youIndex > 0 ? leaderboard[youIndex - 1] : null;
  const gapToNext = aheadOfYou && you ? aheadOfYou.currentValue - you.currentValue : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-rewards-text">Ranks</h1>
        <p className="text-sm text-rewards-muted">{challenge.title} — this week&apos;s leaderboard.</p>
      </div>

      {gapToNext !== null && gapToNext > 0 && aheadOfYou && (
        <p className="rounded-2xl border border-rewards-pink/40 bg-rewards-pink/10 px-4 py-3 text-sm text-rewards-text">
          You&apos;re {dollar ? formatMetricValue(challenge.metricCode, gapToNext) : formatPercent(gapToNext)} away
          from #{youIndex} ({aheadOfYou.name}).
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-rewards-border bg-rewards-surface">
        {leaderboard.map((entry, i) => (
          <div
            key={entry.employeeId}
            className={`flex items-center justify-between gap-3 px-4 py-3 ${
              i > 0 ? "border-t border-rewards-border" : ""
            } ${entry.isYou ? "bg-rewards-purple/15" : ""}`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i === 0
                    ? "bg-rewards-gold/30 text-rewards-gold"
                    : "bg-rewards-surface2 text-rewards-muted"
                }`}
              >
                {entry.rank ?? i + 1}
              </span>
              <span className={`text-sm ${entry.isYou ? "font-semibold text-rewards-text" : "text-rewards-text"}`}>
                {entry.isYou ? "You" : entry.name}
              </span>
            </div>
            <span className="text-sm font-semibold text-rewards-text">
              {formatMetricValue(challenge.metricCode, entry.currentValue)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-rewards-muted">
        Rankings will require a minimum number of eligible transactions once live POS data is connected — for
        now every enrolled participant is shown.
      </p>

      {challenge.teamGoal && (
        <section className="rounded-2xl border border-rewards-border bg-gradient-to-br from-rewards-green/15 to-rewards-surface p-4">
          <h2 className="text-sm font-semibold text-rewards-text">Store Team Goal</h2>
          <div className="mt-2 flex items-center justify-between text-xs text-rewards-muted">
            <span>Current {formatMetricValue(challenge.metricCode, challenge.teamGoal.currentValue)}</span>
            <span>Goal {formatMetricValue(challenge.metricCode, challenge.teamGoal.targetValue)}</span>
          </div>
          <div className="mt-1.5">
            <RewardsProgressBar
              percent={
                challenge.teamGoal.targetValue !== 0
                  ? (challenge.teamGoal.currentValue / challenge.teamGoal.targetValue) * 100
                  : 0
              }
              gradient="from-rewards-green to-rewards-blue"
            />
          </div>
          <p className="mt-2 text-xs text-rewards-muted">
            If achieved, everyone gets +{challenge.teamGoal.pointsAwardedPerEmployee.toLocaleString()} points.
          </p>
        </section>
      )}
    </div>
  );
}
