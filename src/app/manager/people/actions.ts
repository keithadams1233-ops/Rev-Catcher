"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Spec §10 "point reversals" — undoes a redemption before it's fulfilled.
 * `reward_redemptions` has a manager-update RLS policy (see
 * `0004_rls_policies.sql`), but the point_ledger credit that gives the
 * points back is server-written only (CLAUDE.md rule #3), so this goes
 * through the service-role client end to end and does its own
 * authorization check, same as `redeemReward`.
 *
 * The reversal is a *new* ledger row, never an edit or delete of the
 * original debit — `point_ledger` stays append-only (CLAUDE.md rule #2).
 * It reuses the debit's `source_id` (the redemption row itself) so the
 * partial unique index still protects it, but under a different
 * `source_type` (`redemption_reversal`, not `reward_redemption`) — the
 * original debit already occupies `(employee_id, "reward_redemption",
 * redemption.id)`, so the reversal needs its own key to insert at all,
 * and that same key is what makes cancelling the same redemption twice a
 * no-op instead of a double refund.
 */
export async function cancelRedemption(redemptionId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id || !isManagerRole(profile.role)) {
    return { error: "You don't have permission to cancel a redemption." };
  }

  const organizationId = profile.organization_id;
  const supabase = createServiceRoleClient();

  const { data: redemption, error: fetchError } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("id", redemptionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!redemption) return { error: "That redemption couldn't be found." };
  if (redemption.status !== "pending") {
    return { error: `This redemption is already ${redemption.status} — only a pending redemption can be cancelled.` };
  }

  const { data: existingReversal, error: reversalCheckError } = await supabase
    .from("point_ledger")
    .select("id")
    .eq("employee_id", redemption.employee_id)
    .eq("source_type", "redemption_reversal")
    .eq("source_id", redemption.id)
    .maybeSingle();
  if (reversalCheckError) return { error: reversalCheckError.message };

  if (!existingReversal) {
    const { error: reversalError } = await supabase.from("point_ledger").insert({
      organization_id: organizationId,
      employee_id: redemption.employee_id,
      transaction_type: "reversal",
      source_type: "redemption_reversal",
      source_id: redemption.id,
      points: redemption.points_spent,
      dollar_value: redemption.dollar_value,
      description: "Redemption cancelled — points returned",
    });
    if (reversalError) return { error: reversalError.message };
  }

  const { error: statusError } = await supabase
    .from("reward_redemptions")
    .update({ status: "cancelled" })
    .eq("id", redemptionId)
    .eq("organization_id", organizationId);
  if (statusError) return { error: statusError.message };

  revalidatePath("/manager/people");
  revalidatePath("/employee/points");
  revalidatePath("/employee/rewards");
  revalidatePath("/employee");

  return {};
}
