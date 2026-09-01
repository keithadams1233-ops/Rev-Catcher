import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { listEmployeeRoster, listLocations, listPendingRedemptions } from "@/lib/data/manager";
import { PeopleExplorer } from "@/components/manager/people-explorer";
import { CancelRedemptionButton } from "@/components/manager/cancel-redemption-button";

export default async function PeoplePage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
        This account isn&apos;t linked to an organization yet.
      </p>
    );
  }

  const [employees, locations, pendingRedemptions] = await Promise.all([
    listEmployeeRoster(profile.organization_id),
    listLocations(profile.organization_id),
    listPendingRedemptions(profile.organization_id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-manager-text">People</h1>
        <p className="text-sm text-manager-muted">
          Everyone in your organization. Inviting new employees and editing location assignments ships in a
          later phase — this view is read-only for now.
        </p>
      </div>
      <PeopleExplorer employees={employees} locations={locations} />

      {pendingRedemptions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-manager-muted">
            Pending redemptions
          </h2>
          <p className="mt-1 text-xs text-manager-muted">
            Cancel a redemption before it&apos;s fulfilled to return the points to the employee.
          </p>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-manager-border bg-manager-surface">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-manager-border text-xs uppercase tracking-wide text-manager-muted">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Reward</th>
                  <th className="px-4 py-3 font-medium">Points</th>
                  <th className="px-4 py-3 font-medium">Redeemed</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pendingRedemptions.map((r) => (
                  <tr key={r.id} className="border-b border-manager-border last:border-0">
                    <td className="px-4 py-3 text-manager-text">{r.employeeName}</td>
                    <td className="px-4 py-3 text-manager-text">{r.rewardName}</td>
                    <td className="px-4 py-3 text-manager-text">{r.pointsSpent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-manager-muted">
                      {new Date(r.redeemedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <CancelRedemptionButton redemptionId={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
