import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { getDevViewOverride, isDevModeEnabled } from "@/lib/dev/dev-view";
import { createClient } from "@/lib/supabase/server";
import { ManagerBottomNav } from "@/components/manager/manager-bottom-nav";
import { ManagerSidebar } from "@/components/manager/manager-sidebar";
import { DevRoleSwitcher } from "@/components/dev-role-switcher";
import { signOut } from "@/app/login/actions";

export default async function ManagerLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const devOverride = await getDevViewOverride();
  const effectiveView = devOverride ?? (isManagerRole(profile.role) ? "manager" : "employee");

  // A real employee (no dev override active) never lands in the manager
  // experience — org isolation is enforced at the data layer via RLS, but
  // the role gate keeps the right people in the right app.
  if (effectiveView !== "manager") redirect("/employee");

  const orgName = await getOrgName(profile.organization_id);

  return (
    <div className="flex min-h-screen bg-manager-bg text-manager-text">
      <ManagerSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-manager-border px-4 py-3 md:px-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-manager-muted">{orgName ?? "Rev Catcher"}</p>
            <p className="text-sm font-medium text-manager-text">
              {profile.first_name || profile.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isDevModeEnabled() && <DevRoleSwitcher active="manager" />}
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-manager-border px-3 py-1.5 text-xs font-medium text-manager-muted transition-colors hover:text-manager-text"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-6">{children}</main>
        <ManagerBottomNav />
      </div>
    </div>
  );
}

async function getOrgName(organizationId: string | null) {
  if (!organizationId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();
  return data?.name ?? null;
}
