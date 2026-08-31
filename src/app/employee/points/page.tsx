import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getPointsBalance, getPointsHistory } from "@/lib/data/employee";
import { formatCurrency } from "@/lib/format";
import { PhaseStub } from "@/components/phase-stub";

const TYPE_LABELS: Record<string, string> = {
  earn: "Earned",
  redeem: "Redeemed",
  adjustment: "Adjustment",
  reversal: "Reversed",
};

export default async function PointsPage() {
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

  const [balance, history] = await Promise.all([
    getPointsBalance(profile.id),
    getPointsHistory(profile.id),
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-rewards-border bg-gradient-to-br from-rewards-gold/20 via-rewards-surface to-rewards-surface p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-rewards-muted">Points balance</p>
        <p className="mt-1 text-4xl font-bold text-rewards-gold">{balance.toLocaleString()}</p>
        <p className="mt-1 text-sm text-rewards-muted">≈ {formatCurrency(balance / 100)} reward value</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-rewards-muted">History</h2>
        {history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rewards-border p-6 text-center text-sm text-rewards-muted">
            No point activity yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-rewards-border bg-rewards-surface">
            {history.map((entry, i) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-rewards-border" : ""
                }`}
              >
                <div>
                  <p className="text-sm text-rewards-text">{entry.description ?? TYPE_LABELS[entry.transactionType]}</p>
                  <p className="text-[11px] text-rewards-muted">
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {TYPE_LABELS[entry.transactionType] ?? entry.transactionType}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    entry.points >= 0 ? "text-rewards-green" : "text-rewards-muted"
                  }`}
                >
                  {entry.points >= 0 ? "+" : ""}
                  {entry.points.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
