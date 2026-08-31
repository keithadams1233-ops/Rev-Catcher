"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Points/reward_redemptions have no client insert RLS policy by design
 * (CLAUDE.md rule #3) — an employee could otherwise insert a redemption
 * for more points than their ledger actually sums to. This action is the
 * validated path spec §18/ARCHITECTURE.md's "Known trade-offs" called for:
 * it authenticates the caller with the regular session first, then uses
 * the service-role client to read the real balance and write both rows,
 * doing its own authorization instead of relying on RLS to stop misuse.
 */
export async function redeemReward(rewardId: string): Promise<{ success: true } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You need to be signed in to redeem a reward." };
  if (!profile.organization_id) return { error: "This account isn't linked to an organization yet." };

  const employeeId = profile.id;
  const organizationId = profile.organization_id;
  const service = createServiceRoleClient();

  const { data: reward, error: rewardError } = await service
    .from("reward_catalog")
    .select("*")
    .eq("id", rewardId)
    .maybeSingle();

  if (rewardError) return { error: rewardError.message };
  if (!reward || !reward.active) return { error: "That reward isn't available anymore." };
  if (reward.organization_id && reward.organization_id !== organizationId) {
    return { error: "That reward isn't available for your organization." };
  }

  const { data: ledgerRows, error: ledgerError } = await service
    .from("point_ledger")
    .select("points")
    .eq("employee_id", employeeId);

  if (ledgerError) return { error: ledgerError.message };
  const balance = (ledgerRows ?? []).reduce((sum, r) => sum + r.points, 0);

  if (balance < reward.point_cost) {
    return { error: `You need ${reward.point_cost.toLocaleString()} points — you have ${balance.toLocaleString()}.` };
  }

  const { data: redemption, error: insertError } = await service
    .from("reward_redemptions")
    .insert({
      organization_id: organizationId,
      employee_id: employeeId,
      reward_id: reward.id,
      points_spent: reward.point_cost,
      dollar_value: reward.dollar_value,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  // source_id = the redemption row itself, so the partial unique index
  // makes it impossible to double-charge for the same redemption even if
  // this action somehow ran twice for it.
  const { error: debitError } = await service.from("point_ledger").insert({
    organization_id: organizationId,
    employee_id: employeeId,
    transaction_type: "redeem",
    source_type: "reward_redemption",
    source_id: redemption.id,
    points: -reward.point_cost,
    dollar_value: -reward.dollar_value,
    description: `Redeemed ${reward.name}`,
  });

  if (debitError) return { error: debitError.message };

  revalidatePath("/employee/rewards");
  revalidatePath("/employee/points");
  revalidatePath("/employee");

  return { success: true };
}
