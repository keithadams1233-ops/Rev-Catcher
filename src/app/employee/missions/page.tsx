import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getDailyMissions, getEmployeeLocations } from "@/lib/data/employee";
import { MissionCard } from "@/components/rewards/mission-card";
import { PhaseStub } from "@/components/phase-stub";

export default async function MissionsPage() {
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

  const locations = await getEmployeeLocations(profile.id);
  const missions = await getDailyMissions(
    profile.id,
    locations.map((l) => l.id),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-rewards-text">Today&apos;s Missions</h1>
        <p className="text-sm text-rewards-muted">Complete these during your shift to earn XP and points.</p>
      </div>

      {missions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rewards-border p-6 text-center text-sm text-rewards-muted">
          No missions today — check back tomorrow.
        </p>
      ) : (
        <div className="space-y-2.5">
          {missions.map((m) => (
            <MissionCard key={m.id} mission={m} />
          ))}
        </div>
      )}
    </div>
  );
}
