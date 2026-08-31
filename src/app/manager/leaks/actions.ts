"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { detectRevenueLeaks, type DetectionSummary } from "@/lib/revenue-leaks/detect";

/**
 * Manual re-run of leak detection (spec §7-9), for when a manager wants
 * fresh numbers without uploading a new CSV — detection already runs
 * automatically at the end of a successful import
 * (src/app/manager/settings/data-sources/actions.ts), spec §19 step 8.
 */
export async function runLeakDetection(): Promise<{ summary: DetectionSummary } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id || !isManagerRole(profile.role)) {
    return { error: "You don't have permission to run detection." };
  }

  const summary = await detectRevenueLeaks(profile.organization_id);

  revalidatePath("/manager/leaks");
  revalidatePath("/manager");

  return { summary };
}
