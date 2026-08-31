import Link from "next/link";
import { Sparkles } from "lucide-react";
import { RewardsProgressBar } from "@/components/rewards/progress-bar";
import { formatMetricValue } from "@/lib/format";
import type { ActiveChallengeForEmployee } from "@/lib/data/employee";

export function ChallengeCard({ challenge }: { challenge: ActiveChallengeForEmployee }) {
  const percent =
    challenge.targetValue !== 0
      ? Math.min((challenge.currentValue / challenge.targetValue) * 100, 100)
      : 0;

  return (
    <div className="rounded-2xl border border-rewards-border bg-gradient-to-br from-rewards-purple/20 via-rewards-surface to-rewards-surface p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rewards-pink">
          <Sparkles aria-hidden="true" size={14} />
          Live Challenge
        </p>
        <span className="rounded-full border border-rewards-border px-2 py-0.5 text-[11px] text-rewards-muted">
          {challenge.daysRemaining} {challenge.daysRemaining === 1 ? "day" : "days"} left
        </span>
      </div>

      <p className="mt-2 text-lg font-bold text-rewards-text">{challenge.title}</p>
      {challenge.description && <p className="mt-1 text-sm text-rewards-muted">{challenge.description}</p>}

      <div className="mt-3 flex items-center justify-between text-xs text-rewards-muted">
        <span>Current {formatMetricValue(challenge.metricCode, challenge.currentValue)}</span>
        <span>Goal {formatMetricValue(challenge.metricCode, challenge.targetValue)}</span>
      </div>
      <div className="mt-1.5">
        <RewardsProgressBar percent={percent} />
      </div>

      {challenge.nextTierPoints !== null ? (
        <p className="mt-3 text-sm font-semibold text-rewards-gold">
          Potential reward: +{challenge.nextTierPoints.toLocaleString()} points
        </p>
      ) : (
        <p className="mt-3 text-sm font-semibold text-rewards-green">All reward tiers unlocked 🎉</p>
      )}

      {challenge.rank !== null && (
        <p className="mt-1 text-xs text-rewards-muted">Currently ranked #{challenge.rank}</p>
      )}

      <Link
        href="/employee/ranks"
        className="mt-3 inline-block text-xs font-semibold text-rewards-pink hover:underline"
      >
        View leaderboard →
      </Link>
    </div>
  );
}
