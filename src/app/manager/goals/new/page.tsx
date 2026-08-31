import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getLeak, listEmployeesAtLocation } from "@/lib/data/manager";
import { GoalBuilder } from "@/components/manager/goal-builder";

export default async function NewGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ leakId?: string }>;
}) {
  const { leakId } = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile?.organization_id) {
    return (
      <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
        This account isn&apos;t linked to an organization yet.
      </p>
    );
  }

  if (!leakId) {
    return (
      <div className="rounded-2xl border border-dashed border-manager-border p-6 text-center">
        <p className="text-sm text-manager-text">Pick a revenue leak to build a challenge from.</p>
        <Link
          href="/manager/leaks"
          className="mt-3 inline-block rounded-lg bg-manager-accent px-4 py-2 text-sm font-semibold text-manager-bg"
        >
          Browse Revenue Leaks
        </Link>
      </div>
    );
  }

  const leak = await getLeak(profile.organization_id, leakId);

  if (!leak) {
    return (
      <p className="rounded-2xl border border-dashed border-manager-border p-6 text-center text-sm text-manager-muted">
        That revenue leak couldn&apos;t be found.
      </p>
    );
  }

  if (leak.associatedChallengeId) {
    redirect(`/manager/goals/${leak.associatedChallengeId}`);
  }

  const employees = await listEmployeesAtLocation(profile.organization_id, leak.locationId);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Link href={`/manager/leaks/${leak.id}`} className="text-xs font-medium text-manager-muted hover:text-manager-text">
          ← Back to leak
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-manager-text">Build a Challenge</h1>
      </div>
      <GoalBuilder leak={leak} employeeCount={employees.length} />
    </div>
  );
}
