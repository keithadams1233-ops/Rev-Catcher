import { redirect } from "next/navigation";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { getDevViewOverride } from "@/lib/dev/dev-view";

// Landing route: sends signed-out visitors to /login, and signed-in users
// straight into the experience that matches their role (spec §3) — unless
// the dev-only role switcher (§21) has set an override.
export default async function RootPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  const devOverride = await getDevViewOverride();
  const effectiveView = devOverride ?? (isManagerRole(profile.role) ? "manager" : "employee");

  redirect(effectiveView === "manager" ? "/manager" : "/employee");
}
