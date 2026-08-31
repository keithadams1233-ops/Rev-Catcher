import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { listEmployeeRoster, listLocations } from "@/lib/data/manager";
import { PeopleExplorer } from "@/components/manager/people-explorer";

export default async function PeoplePage() {
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
        This account isn&apos;t linked to an organization yet.
      </p>
    );
  }

  const [employees, locations] = await Promise.all([
    listEmployeeRoster(profile.organization_id),
    listLocations(profile.organization_id),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-manager-text">People</h1>
        <p className="text-sm text-manager-muted">
          Everyone in your organization. Inviting new employees and editing location assignments ships in a
          later phase — this view is read-only for now.
        </p>
      </div>
      <PeopleExplorer employees={employees} locations={locations} />
    </div>
  );
}
