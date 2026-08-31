import type { MappedRow, NormalizedCsvRow, RowError, ValidationResult } from "./types";

/**
 * Validates and coerces every mapped row (spec §19: "reject malformed
 * rows"). A row with any problem is dropped into `errors` and excluded
 * from `validRows` entirely — partial success (import what's valid,
 * report what isn't) rather than one bad row failing the whole file.
 */
export function validateRows(mappedRows: MappedRow[]): ValidationResult {
  const validRows: NormalizedCsvRow[] = [];
  const errors: RowError[] = [];

  mappedRows.forEach((raw, i) => {
    const rowNumber = i + 2; // 1-indexed, +1 for the header row
    const result = validateRow(raw, rowNumber);
    if (result.ok) {
      validRows.push(result.row);
    } else {
      errors.push(...result.errors);
    }
  });

  return { validRows, errors };
}

function validateRow(
  raw: MappedRow,
  rowNumber: number,
): { ok: true; row: NormalizedCsvRow } | { ok: false; errors: RowError[] } {
  const problems: string[] = [];

  const externalTransactionId = (raw.transaction_id ?? "").trim();
  if (!externalTransactionId) problems.push("Missing transaction ID");

  const timestampRaw = (raw.timestamp ?? "").trim();
  const parsedDate = timestampRaw ? new Date(timestampRaw) : null;
  if (!timestampRaw) {
    problems.push("Missing timestamp");
  } else if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    problems.push(`Unrecognized timestamp "${timestampRaw}"`);
  }

  const locationName = (raw.location ?? "").trim();
  if (!locationName) problems.push("Missing location");

  const itemName = (raw.item_name ?? "").trim();
  if (!itemName) problems.push("Missing item name");

  const quantityRaw = (raw.quantity ?? "").trim();
  const quantity = quantityRaw ? Number(quantityRaw) : NaN;
  if (!quantityRaw) {
    problems.push("Missing quantity");
  } else if (!Number.isFinite(quantity) || quantity <= 0) {
    problems.push(`Invalid quantity "${quantityRaw}"`);
  }

  const priceRaw = (raw.price ?? "").trim();
  const price = priceRaw ? parseMoney(priceRaw) : NaN;
  if (!priceRaw) {
    problems.push("Missing price");
  } else if (!Number.isFinite(price) || price < 0) {
    problems.push(`Invalid price "${priceRaw}"`);
  }

  const discountRaw = (raw.discount ?? "").trim();
  const discount = discountRaw ? parseMoney(discountRaw) : 0;
  if (discountRaw && (!Number.isFinite(discount) || discount < 0)) {
    problems.push(`Invalid discount "${discountRaw}"`);
  }

  if (problems.length > 0) {
    return { ok: false, errors: problems.map((message) => ({ rowNumber, message })) };
  }

  return {
    ok: true,
    row: {
      rowNumber,
      externalTransactionId,
      // problems.length === 0 here guarantees parsedDate is a valid Date.
      timestamp: parsedDate ? parsedDate.toISOString() : "",
      locationName,
      employeeIdentifier: (raw.employee ?? "").trim() || null,
      itemName,
      category: (raw.category ?? "").trim() || null,
      quantity,
      price,
      discount,
      voided: parseBoolean(raw.voided),
      refunded: parseBoolean(raw.refunded),
    },
  };
}

/** Strips currency symbols/thousands separators: "$1,234.56" -> 1234.56 */
function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  return cleaned ? Number(cleaned) : NaN;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "y"]);
function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}
