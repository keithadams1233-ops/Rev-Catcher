import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { getDevViewOverride, isDevModeEnabled } from "@/lib/dev/dev-view";
import { RewardsBottomNav } from "@/components/rewards/rewards-bottom-nav";
import { DevRoleSwitcher } from "@/components/dev-role-switcher";
import { signOut } from "@/app/login/actions";

export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const devOverride = await getDevViewOverride();
  const effectiveView = devOverride ?? (isManagerRole(profile.role) ? "manager" : "employee");

  if (effectiveView !== "employee") redirect("/manager");

  return (
    <div className="flex min-h-screen flex-col bg-rewards-bg text-rewards-text">
      <header className="flex items-center justify-between bg-gradient-to-br from-rewards-purple/30 via-rewards-bg to-rewards-bg px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-rewards-muted">Rev Rewards</p>
          <p className="text-sm font-medium text-rewards-text">
            Hey {profile.first_name || profile.email.split("@")[0]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDevModeEnabled() && <DevRoleSwitcher active="employee" />}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-rewards-border px-3 py-1.5 text-xs font-medium text-rewards-muted transition-colors hover:text-rewards-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      <RewardsBottomNav />
    </div>
  );
}
