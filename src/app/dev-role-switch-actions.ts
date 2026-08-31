"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_VIEW_COOKIE, isDevModeEnabled, type DevView } from "@/lib/dev/dev-view";

export async function setDevView(view: DevView) {
  if (!isDevModeEnabled()) return;

  const cookieStore = await cookies();
  cookieStore.set(DEV_VIEW_COOKIE, view, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(view === "manager" ? "/manager" : "/employee");
}
