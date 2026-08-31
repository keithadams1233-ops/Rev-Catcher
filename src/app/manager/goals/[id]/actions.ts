"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";

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
