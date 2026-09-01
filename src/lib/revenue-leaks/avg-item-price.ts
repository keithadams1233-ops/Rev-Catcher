import "server-only";

import { DEFAULT_ATTACHMENT_RULES, itemIsTargetAttachment } from "@/lib/metrics/category-rules";
import type { AttachmentMetricCode } from "@/lib/metrics/category-rules";
import type { EngineTransactionItem } from "@/lib/metrics/types";
import type { createServiceRoleClient, createClient } from "@/lib/supabase/server";

/** Accepts either Supabase client this app uses — the service-role client
 * (`detect.ts`, trusted server pipeline) or the session-scoped RLS client
 * (`src/lib/data/manager.ts`'s ROI reader, an ordinary manager read). Both
 * wrap the same `createServerClient<Database>(...)` call, so they're
 * structurally identical; the union just documents both are expected. */
type Client = ReturnType<typeof createServiceRoleClient> | Awaited<ReturnType<typeof createClient>>;

/**
 * Average price of whatever item a metric's target category/modifier
 * rule matches at one location, from real `transaction_items` — the
 * `avg_attached_item_price` input spec §8's revenue formula needs and
 * `average_ticket` doesn't (its gap is already a dollar amount, see
 * `opportunity.ts`). Extracted out of `detect.ts` so Phase 9's ROI report
 * (`src/lib/roi/`) can compute the exact same "actual" number the leak
 * detector uses for "projected" — one price lookup, two callers, instead
 * of two copies of the same category-rule filter drifting apart.
 *
 * No date scoping: item pricing is assumed roughly stable over a pilot's
 * timeframe (same simplification `detect.ts` already made for the leak
 * detector — a reasonable approximation for an *estimate* input, not the
 * core rate calculation itself).
 */
export async function getAvgAttachedItemPrice(
  supabase: Client,
  organizationId: string,
  locationId: string,
  metricCode: AttachmentMetricCode,
): Promise<number> {
  const { data, error } = await supabase
    .from("transaction_items")
    .select("category, modifier_names, unit_price")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("voided", false)
    .eq("refunded", false)
    .limit(5000);
  if (error) throw error;

  const items = (data ?? []).map((i) => ({
    category: i.category,
    itemName: "",
    modifierNames: i.modifier_names,
    quantity: 0,
    totalPrice: 0,
    voided: false,
    refunded: false,
    unitPrice: i.unit_price,
  })) as (EngineTransactionItem & { unitPrice: number })[];

  const rule = DEFAULT_ATTACHMENT_RULES[metricCode];
  const matching = items.filter((i) => itemIsTargetAttachment(i, rule));
  if (matching.length === 0) return 0;
  return matching.reduce((sum, i) => sum + i.unitPrice, 0) / matching.length;
}
