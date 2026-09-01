"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { updateChallengeProgress, type ProgressUpdateSummary } from "@/lib/challenges/update-progress";

/**
 * Manual re-run of progress updates, for when a manager wants fresh
 * standings without uploading a new CSV — this already runs automatically
 * at the end of a successful import (spec §19 step 9).
 */
export async function runProgressUpdate(): Promise<{ summary: ProgressUpdateSummary } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id || !isManagerRole(profile.role)) {
    return { error: "You don't have permission to update progress." };
  }

  const summary = await updateChallengeProgress(profile.organization_id);

  revalidatePath("/manager/goals");
  revalidatePath("/manager");

  return { summary };
}

export async function cancelChallenge(challengeId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id || !isManagerRole(profile.role)) {
    return { error: "You don't have permission to cancel this challenge." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("challenges")
    .update({ status: "cancelled" })
    .eq("id", challengeId)
    .eq("organization_id", profile.organization_id);

  if (error) return { error: error.message };

  revalidatePath(`/manager/goals/${challengeId}`);
  revalidatePath("/manager/goals");
  return {};
}
