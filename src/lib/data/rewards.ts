import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Reward catalog reads — role-agnostic (both the manager Settings screen
 * and the employee Rewards screen read the same catalog), so it lives
 * outside data/manager.ts and data/employee.ts rather than being owned by
 * either.
 */

export interface RewardCatalogItem {
  id: string;
  name: string;
  description: string | null;
  pointCost: number;
  dollarValue: number;
  isOrgSpecific: boolean;
}

export async function listRewardCatalog(organizationId: string): Promise<RewardCatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reward_catalog")
    .select("*")
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .eq("active", true)
    .order("point_cost", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    pointCost: r.point_cost,
    dollarValue: r.dollar_value,
    isOrgSpecific: r.organization_id !== null,
  }));
}
