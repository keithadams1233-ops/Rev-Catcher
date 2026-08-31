import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getPointsBalance, getMyRedemptions } from "@/lib/data/employee";
import { listRewardCatalog } from "@/lib/data/rewards";
import { formatCurrency } from "@/lib/format";
import { RedeemButton } from "@/components/rewards/redeem-button";
import { PhaseStub } from "@/components/phase-stub";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export default async function RewardsPage() {
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

  const [balance, catalog, redemptions] = await Promise.all([
    getPointsBalance(profile.id),
    listRewardCatalog(profile.organization_id),
    getMyRedemptions(profile.id),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-rewards-text">Rewards</h1>
        <p className="text-sm text-rewards-muted">
          You have <span className="font-semibold text-rewards-gold">{balance.toLocaleString()} points</span> —{" "}
          {formatCurrency(balance / 100)} in reward value.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {catalog.map((r) => (
          <div key={r.id} className="rounded-2xl border border-rewards-border bg-rewards-surface p-4 text-center">
            <p className="text-2xl font-bold text-rewards-text">{formatCurrency(r.dollarValue)}</p>
            <p className="mt-0.5 text-xs text-rewards-muted">{r.pointCost.toLocaleString()} pts</p>
            <div className="mt-3">
              <RedeemButton rewardId={r.id} canAfford={balance >= r.pointCost} />
            </div>
          </div>
        ))}
      </div>

      {redemptions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-rewards-muted">Your redemptions</h2>
          <div className="overflow-hidden rounded-2xl border border-rewards-border bg-rewards-surface">
            {redemptions.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-rewards-border" : ""
                }`}
              >
                <div>
                  <p className="text-sm text-rewards-text">{r.rewardName}</p>
                  <p className="text-[11px] text-rewards-muted">
                    {new Date(r.redeemedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                    {r.pointsSpent.toLocaleString()} pts
                  </p>
                </div>
                <span className="rounded-full border border-rewards-border px-2 py-0.5 text-[11px] text-rewards-muted">
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
