import type { NormalizedCsvRow, NormalizedTransactionGroup, NormalizedTransactionItem } from "./types";

/**
 * A POS export is one row per line item; `transaction_id` is what ties
 * several rows into one order. This is the "normalization" step (spec
 * §19): group by transaction ID, then derive the transaction-level fields
 * (subtotal, discount, total, refund amount, void status) that the CSV
 * itself never states directly.
 *
 * `price` is treated as each row's line total (quantity already priced
 * in), not a per-unit price — see CSV_TARGET_FIELDS' label. `unitPrice` is
 * back-derived for storage since the schema keeps both.
 *
 * Void/refund are per-item in the CSV; a transaction is only marked
 * `voided` if *every* item in it was voided (a single voided item off an
 * otherwise-normal order is a partial void, tracked at the item level —
 * see transaction_items.voided). `refundAmount` sums the line totals of
 * whatever items were marked refunded.
 */
export function groupIntoTransactions(rows: NormalizedCsvRow[]): NormalizedTransactionGroup[] {
  const groups = new Map<string, NormalizedCsvRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.externalTransactionId);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.externalTransactionId, [row]);
    }
  }

  return [...groups.entries()].map(([externalTransactionId, groupRows]) => {
    const items: NormalizedTransactionItem[] = groupRows.map((r) => ({
      itemName: r.itemName,
      category: r.category,
      quantity: r.quantity,
      unitPrice: r.quantity > 0 ? round2(r.price / r.quantity) : r.price,
      totalPrice: round2(r.price),
      voided: r.voided,
      refunded: r.refunded,
    }));

    const subtotal = round2(items.reduce((sum, i) => sum + i.totalPrice, 0));
    const discountTotal = round2(groupRows.reduce((sum, r) => sum + r.discount, 0));
    const refundAmount = round2(items.filter((i) => i.refunded).reduce((sum, i) => sum + i.totalPrice, 0));
    const voided = items.every((i) => i.voided);

    // Earliest row timestamp represents when the order was placed.
    const timestamp = [...groupRows].map((r) => r.timestamp).sort()[0];
    // Location/employee should agree across one order's rows in a real
    // export; take the first non-empty value rather than trying to
    // arbitrate a genuinely inconsistent file.
    const locationName = groupRows[0].locationName;
    const employeeIdentifier = groupRows.find((r) => r.employeeIdentifier)?.employeeIdentifier ?? null;

    return {
      externalTransactionId,
      timestamp,
      locationName,
      employeeIdentifier,
      subtotal,
      discountTotal,
      total: round2(subtotal - discountTotal),
      refundAmount,
      voided,
      items,
    };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
