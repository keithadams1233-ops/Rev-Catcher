import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { listLeaks, listLocations } from "@/lib/data/manager";
import { LeaksExplorer } from "@/components/manager/leaks-explorer";
import { DetectLeaksButton } from "@/components/manager/detect-leaks-button";
import { PhaseStub } from "@/components/phase-stub";

export default async function RevenueLeaksPage() {
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

  const [leaks, locations] = await Promise.all([
    listLeaks(profile.organization_id),
    listLocations(profile.organization_id),
  ]);

  const metricCodes = Array.from(new Set(leaks.map((l) => l.metricCode)));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-manager-text">Revenue Leaks</h1>
          <p className="text-sm text-manager-muted">
            Estimated opportunities, sorted by contribution profit by default.
          </p>
        </div>
        <DetectLeaksButton />
      </div>
      <LeaksExplorer leaks={leaks} locations={locations} metricCodes={metricCodes} />
    </div>
  );
}
