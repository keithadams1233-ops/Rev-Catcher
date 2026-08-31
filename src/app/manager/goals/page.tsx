import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { listChallenges } from "@/lib/data/manager";
import { StatusBadge } from "@/components/manager/status-badge";
import { formatCurrency, formatMetricValue, metricName } from "@/lib/format";

const STATUS_ORDER = ["active", "scheduled", "draft", "completed", "cancelled"];

export default async function GoalsPage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
        This account isn&apos;t linked to an organization yet.
      </p>
    );
  }

  const challenges = await listChallenges(profile.organization_id);
  const sorted = [...challenges].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-manager-text">Goals &amp; Challenges</h1>
          <p className="text-sm text-manager-muted">Launched from a revenue leak, tracked to completion.</p>
        </div>
        <Link
          href="/manager/leaks"
          className="rounded-lg bg-manager-accent px-3 py-2 text-xs font-semibold text-manager-bg"
        >
          + New challenge
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
          No challenges yet. Launch one from a revenue leak to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <Link
              key={c.id}
              href={`/manager/goals/${c.id}`}
              className="block rounded-2xl border border-manager-border bg-manager-surface p-4 transition-colors hover:border-manager-accent/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-manager-text">{c.title}</p>
                  <p className="text-xs text-manager-muted">
                    {c.locationName} · {metricName(c.metricCode)}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-manager-muted">Baseline → Target</p>
                  <p className="font-semibold text-manager-text">
                    {formatMetricValue(c.metricCode, c.baselineValue)} →{" "}
                    {formatMetricValue(c.metricCode, c.targetValue)}
                  </p>
                </div>
                <div>
                  <p className="text-manager-muted">Reward pool</p>
                  <p className="font-semibold text-manager-text">{formatCurrency(c.rewardBudget)}</p>
                </div>
                <div>
                  <p className="text-manager-muted">Participants</p>
                  <p className="font-semibold text-manager-text">{c.participantCount}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
