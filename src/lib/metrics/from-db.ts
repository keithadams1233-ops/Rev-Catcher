import type { Tables } from "@/lib/types/database";
import type { EngineTransaction } from "./types";

/**
 * The one place that maps real `transactions`/`transaction_items` rows
 * into the engine's input shape. Pure data reshaping — no Supabase client,
 * no fetching — so it's usable from anywhere that already has the rows
 * (a future metric-recalculation job in Phase 5/6, or a test fixture).
 */
export function toEngineTransactions(
  transactions: Tables<"transactions">[],
  items: Tables<"transaction_items">[],
): EngineTransaction[] {
  const itemsByTransaction = new Map<string, Tables<"transaction_items">[]>();
  for (const item of items) {
    const group = itemsByTransaction.get(item.transaction_id);
    if (group) {
      group.push(item);
    } else {
      itemsByTransaction.set(item.transaction_id, [item]);
    }
  }

  return transactions.map((t) => ({
    id: t.id,
    locationId: t.location_id,
    employeeId: t.employee_id,
    total: t.total,
    refundAmount: t.refund_amount,
    voided: t.voided,
    items: (itemsByTransaction.get(t.id) ?? []).map((i) => ({
      category: i.category,
      itemName: i.item_name,
      modifierNames: i.modifier_names,
      quantity: i.quantity,
      totalPrice: i.total_price,
      refunded: i.refunded,
      voided: i.voided,
    })),
  }));
}
