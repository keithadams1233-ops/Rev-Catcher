import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getOpportunitySummary, getTopLeaks } from "@/lib/data/manager";
import { formatCurrency, formatMultiplier } from "@/lib/format";
import { StatCard } from "@/components/manager/stat-card";
import { LeakCard } from "@/components/manager/leak-card";
import { PhaseStub } from "@/components/phase-stub";

export default async function ManagerHomePage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <PhaseStub
        title="No organization assigned"
        description="This account isn't linked to an organization yet. Ask an administrator to assign one."
        accent="manager"
      />
    );
  }

  const [summary, topLeaks] = await Promise.all([
    getOpportunitySummary(profile.organization_id),
    getTopLeaks(profile.organization_id, 3),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-manager-border bg-manager-surface p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-manager-muted">
          Monthly revenue opportunity
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-manager-accent">
          {formatCurrency(summary.totalRevenueOpportunity)}
        </p>
        <p className="mt-2 text-xs text-manager-muted">
          Estimated — from {summary.openLeakCount} detected revenue{" "}
          {summary.openLeakCount === 1 ? "leak" : "leaks"} across your locations. Not a guarantee.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Contribution profit opportunity"
          value={formatCurrency(summary.totalContributionProfit)}
          tone="positive"
        />
        <StatCard label="Active challenges" value={String(summary.activeChallengeCount)} />
        <StatCard
          label="Recovered profit"
          value={
            summary.recoveredContributionProfit === null
              ? "—"
              : formatCurrency(summary.recoveredContributionProfit)
          }
          sub={summary.recoveredContributionProfit === null ? "Available once a challenge completes" : undefined}
        />
        <StatCard
          label="Reward ROI"
          value={summary.rewardRoi === null ? "—" : formatMultiplier(summary.rewardRoi)}
          sub={summary.rewardRoi === null ? "Available once a challenge completes" : undefined}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-manager-muted">
            Top revenue leaks
          </h2>
          <Link href="/manager/leaks" className="text-xs font-medium text-manager-accent hover:underline">
            View all
          </Link>
        </div>

        {topLeaks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
            No revenue leaks detected yet. Upload POS data to get started.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {topLeaks.map((leak) => (
              <LeakCard key={leak.id} leak={leak} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
