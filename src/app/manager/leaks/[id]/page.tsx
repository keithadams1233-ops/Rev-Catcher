import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getLeak } from "@/lib/data/manager";
import { ConfidenceBadge } from "@/components/manager/confidence-badge";
import { StatCard } from "@/components/manager/stat-card";
import { formatCurrency, formatMetricValue, formatPercent, isDollarMetric } from "@/lib/format";

export default async function LeakDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) notFound();

  const leak = await getLeak(profile.organization_id, id);
  if (!leak) notFound();

  const dollar = isDollarMetric(leak.metricCode);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/manager/leaks" className="text-xs font-medium text-manager-muted hover:text-manager-text">
          ← Revenue Leaks
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-manager-text">{leak.metricName}</h1>
            <p className="text-sm text-manager-muted">{leak.locationName}</p>
          </div>
          <ConfidenceBadge score={leak.confidenceScore} />
        </div>
      </div>

      {leak.metricDescription && (
        <p className="rounded-xl border border-manager-border bg-manager-surface p-4 text-sm text-manager-muted">
          {leak.metricDescription}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Current" value={formatMetricValue(leak.metricCode, leak.currentValue)} />
        <StatCard label="Benchmark" value={formatMetricValue(leak.metricCode, leak.benchmarkValue)} tone="positive" />
      </div>

      <div className="rounded-2xl border border-manager-border bg-manager-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-manager-muted">Gap to benchmark</p>
        <p className="mt-1 text-lg font-semibold text-manager-text">
          {dollar ? formatCurrency(leak.gap) : formatPercent(leak.gap)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Est. incremental revenue"
          value={formatCurrency(leak.estimatedIncrementalRevenue)}
          tone="positive"
        />
        <StatCard
          label="Est. contribution profit"
          value={formatCurrency(leak.estimatedContributionProfit)}
          tone="positive"
        />
      </div>

      <p className="text-xs text-manager-muted">
        Estimated from current sales patterns and the selected benchmark. These are projections, not
        guarantees.
      </p>

      {leak.associatedChallengeId ? (
        <Link
          href={`/manager/goals/${leak.associatedChallengeId}`}
          className="block w-full rounded-lg bg-manager-accent px-4 py-3 text-center text-sm font-semibold text-manager-bg transition-opacity hover:opacity-90"
        >
          View challenge
        </Link>
      ) : (
        <Link
          href={`/manager/goals/new?leakId=${leak.id}`}
          className="block w-full rounded-lg bg-manager-accent px-4 py-3 text-center text-sm font-semibold text-manager-bg transition-opacity hover:opacity-90"
        >
          Create Challenge
        </Link>
      )}
    </div>
  );
}
