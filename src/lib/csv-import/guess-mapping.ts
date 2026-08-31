import { CSV_TARGET_FIELDS, EMPTY_MAPPING, type ColumnMapping, type CsvTargetFieldKey } from "./types";

/**
 * Best-effort auto-mapping from a file's own headers — a starting point
 * the manager reviews and corrects in the mapping UI, not a guarantee.
 * Exact header matches are tried before substring matches, so a header
 * that happens to contain another field's keyword doesn't steal it from a
 * more precise match.
 */
const KEYWORDS: Record<CsvTargetFieldKey, string[]> = {
  transaction_id: ["transaction id", "transaction_id", "order id", "check id", "ticket id"],
  timestamp: ["timestamp", "datetime", "date", "time"],
  location: ["location", "store", "site"],
  employee: ["employee", "cashier", "server", "staff"],
  item_name: ["item name", "item", "product", "menu item"],
  category: ["category", "item category"],
  quantity: ["quantity", "qty"],
  price: ["price", "line total", "amount", "total"],
  discount: ["discount"],
  voided: ["voided", "void"],
  refunded: ["refunded", "refund"],
};

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const usedHeaders = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, norm: h.toLowerCase().trim() }));

  const tryMatch = (matches: (norm: string, keyword: string) => boolean) => {
    for (const field of CSV_TARGET_FIELDS) {
      if (mapping[field.key]) continue;
      const found = normalized.find(
        (h) => !usedHeaders.has(h.raw) && KEYWORDS[field.key].some((k) => matches(h.norm, k)),
      );
      if (found) {
        mapping[field.key] = found.raw;
        usedHeaders.add(found.raw);
      }
    }
  };

  tryMatch((norm, k) => norm === k);
  tryMatch((norm, k) => norm.includes(k));

  return mapping;
}
