import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getChallenge } from "@/lib/data/manager";
import { StatusBadge } from "@/components/manager/status-badge";
import { StatCard } from "@/components/manager/stat-card";
import { ProgressBar, progressPercent } from "@/components/manager/progress-bar";
import { CancelChallengeButton } from "@/components/manager/cancel-challenge-button";
import { UpdateProgressButton } from "@/components/manager/update-progress-button";
import {
  formatCurrency,
  formatMetricValue,
  isDollarMetric,
  metricName,
} from "@/lib/format";
import { rewardRatio } from "@/lib/challenges/recommendations";

export default async function ChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) notFound();

  const challenge = await getChallenge(profile.organization_id, id);
  if (!challenge) notFound();

  const dollar = isDollarMetric(challenge.metricCode);
  const fmt = (v: number) => formatMetricValue(challenge.metricCode, v);

  const avgCurrent =
    challenge.participants.length > 0
      ? challenge.participants.reduce((s, p) => s + p.currentValue, 0) / challenge.participants.length
      : challenge.baselineValue;

  const ratio = rewardRatio(challenge.projectedContributionProfit, challenge.rewardBudget);
  const canCancel = challenge.status === "active" || challenge.status === "scheduled";

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href="/manager/goals" className="text-xs font-medium text-manager-muted hover:text-manager-text">
          ← Goals &amp; Challenges
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-manager-text">{challenge.title}</h1>
            <p className="text-sm text-manager-muted">
              {challenge.locationName} · {metricName(challenge.metricCode)}
            </p>
          </div>
          <StatusBadge status={challenge.status} />
        </div>
        {challenge.description && (
          <p className="mt-2 text-sm text-manager-muted">{challenge.description}</p>
        )}
        <p className="mt-1 text-xs text-manager-muted">
          {challenge.startDate} → {challenge.endDate}
        </p>
      </div>

      <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <div className="flex items-center justify-between text-xs text-manager-muted">
          <span>Baseline {fmt(challenge.baselineValue)}</span>
          <span>Team average {fmt(avgCurrent)}</span>
          <span>Target {fmt(challenge.targetValue)}</span>
        </div>
        <div className="mt-2">
          <ProgressBar percent={progressPercent(challenge.baselineValue, avgCurrent, challenge.targetValue)} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Projected revenue" value={formatCurrency(challenge.projectedIncrementalRevenue)} tone="positive" />
        <StatCard label="Projected profit" value={formatCurrency(challenge.projectedContributionProfit)} tone="positive" />
        <StatCard label="Reward budget" value={formatCurrency(challenge.rewardBudget)} />
        <StatCard label="Profit / reward ratio" value={Number.isFinite(ratio) ? `${ratio.toFixed(1)}x` : "—"} />
      </section>

      <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <h2 className="text-sm font-semibold text-manager-text">Reward tiers</h2>
        <div className="mt-3 space-y-2">
          {challenge.tiers.map((tier) => {
            const reachedCount = challenge.participants.filter((p) => p.currentValue >= tier.thresholdValue).length;
            return (
              <div
                key={tier.id}
                className="flex items-center justify-between rounded-lg border border-manager-border bg-manager-surface2 px-3 py-2 text-sm"
              >
                <span className="text-manager-text">
                  {tier.name} · {dollar ? formatCurrency(tier.thresholdValue) : fmt(tier.thresholdValue)}
                </span>
                <span className="text-manager-muted">
                  +{tier.pointsAwarded.toLocaleString()} pts · {reachedCount}/{challenge.participants.length} reached
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {challenge.teamGoal && (
        <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
          <h2 className="text-sm font-semibold text-manager-text">Store team goal</h2>
          <div className="mt-2 flex items-center justify-between text-xs text-manager-muted">
            <span>Current {fmt(challenge.teamGoal.currentValue)}</span>
            <span>Goal {fmt(challenge.teamGoal.targetValue)}</span>
          </div>
          <div className="mt-2">
            <ProgressBar
              percent={progressPercent(
                challenge.baselineValue,
                challenge.teamGoal.currentValue,
                challenge.teamGoal.targetValue,
              )}
              tone="pink"
            />
          </div>
          <p className="mt-2 text-xs text-manager-muted">
            If the team hits this goal, everyone earns +{challenge.teamGoal.pointsAwardedPerEmployee.toLocaleString()}{" "}
            points.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <h2 className="text-sm font-semibold text-manager-text">Standings</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-manager-muted">
                <th className="pb-2 font-medium">Rank</th>
                <th className="pb-2 font-medium">Employee</th>
                <th className="pb-2 font-medium">Current</th>
                <th className="pb-2 font-medium">Points</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {challenge.participants.map((p) => (
                <tr key={p.employeeId} className="border-t border-manager-border">
                  <td className="py-2 text-manager-muted">{p.rank ?? "—"}</td>
                  <td className="py-2 text-manager-text">{p.employeeName}</td>
                  <td className="py-2 text-manager-text">{fmt(p.currentValue)}</td>
                  <td className="py-2 text-manager-text">{p.pointsEarned.toLocaleString()}</td>
                  <td className="py-2 text-manager-muted">{p.completed ? "Completed" : "In progress"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center gap-3">
        {challenge.status === "active" && <UpdateProgressButton />}
        {canCancel && <CancelChallengeButton challengeId={challenge.id} />}
      </div>
    </div>
  );
}
