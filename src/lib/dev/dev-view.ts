import { cookies } from "next/headers";

export const DEV_VIEW_COOKIE = "rc_dev_view";
export type DevView = "manager" | "employee";

/**
 * The demo role switcher (spec §21) is dev/demo tooling only — it is
 * inert whenever NODE_ENV is "production", so it can never let a real
 * pilot user self-elevate into the manager experience in production.
 */
export function isDevModeEnabled() {
  return process.env.NODE_ENV !== "production";
}

export async function getDevViewOverride(): Promise<DevView | null> {
  if (!isDevModeEnabled()) return null;
  const cookieStore = await cookies();
  const value = cookieStore.get(DEV_VIEW_COOKIE)?.value;
  return value === "manager" || value === "employee" ? value : null;
}
