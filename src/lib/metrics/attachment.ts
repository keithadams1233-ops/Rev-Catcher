import { isCleanTransaction, isCleanItem } from "./eligibility";
import { itemMakesTransactionEligible, itemIsTargetAttachment, type AttachmentRule } from "./category-rules";
import type { EngineTransaction, MetricResult } from "./types";

/**
 * Generic attachment-rate detector (spec §7, Detectors 1-3 & 5 — beverage,
 * add-on, premium upgrade, and dessert attachment are all this same
 * formula with a different `AttachmentRule`):
 *
 *   attachment_rate = eligible_transactions_with_target / eligible_transactions
 *
 * Voided/refunded transactions never enter either count (spec §16).
 * Within a clean transaction, a voided/refunded line item doesn't count
 * toward eligibility or as an attach — it was never really there.
 */
export function calculateAttachmentRate(transactions: EngineTransaction[], rule: AttachmentRule): MetricResult {
  let denominator = 0;
  let numerator = 0;

  for (const txn of transactions) {
    if (!isCleanTransaction(txn)) continue;

    const cleanItems = txn.items.filter(isCleanItem);
    const isEligible = cleanItems.some((item) => itemMakesTransactionEligible(item, rule));
    if (!isEligible) continue;

    denominator += 1;
    if (cleanItems.some((item) => itemIsTargetAttachment(item, rule))) {
      numerator += 1;
    }
  }

  return {
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : 0,
  };
}
