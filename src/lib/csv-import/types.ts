/**
 * CSV import (spec §19). This module is deliberately environment-agnostic —
 * no Supabase client, no Next.js — so the exact same parse/validate/group
 * logic runs client-side for the upload wizard's live preview and
 * server-side as the authoritative check before anything is written. The
 * server action never trusts the client's validation results, only the
 * same pure functions re-run on its own copy of the data.
 */

export const CSV_TARGET_FIELDS = [
  { key: "transaction_id", label: "Transaction ID", required: true },
  { key: "timestamp", label: "Timestamp", required: true },
  { key: "location", label: "Location", required: true },
  { key: "employee", label: "Employee", required: false },
  { key: "item_name", label: "Item Name", required: true },
  { key: "category", label: "Category", required: false },
  { key: "quantity", label: "Quantity", required: true },
  { key: "price", label: "Price (line total, before discount)", required: true },
  { key: "discount", label: "Discount", required: false },
  { key: "voided", label: "Voided", required: false },
  { key: "refunded", label: "Refunded", required: false },
] as const;

export type CsvTargetFieldKey = (typeof CSV_TARGET_FIELDS)[number]["key"];

/** Target field -> source CSV header name (or null if left unmapped). */
export type ColumnMapping = Record<CsvTargetFieldKey, string | null>;

export const EMPTY_MAPPING: ColumnMapping = Object.fromEntries(
  CSV_TARGET_FIELDS.map((f) => [f.key, null]),
) as ColumnMapping;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** One row after mapping, still raw strings keyed by target field. */
export type MappedRow = Partial<Record<CsvTargetFieldKey, string>>;

/** One row after validation/coercion — ready to group into transactions. */
export interface NormalizedCsvRow {
  rowNumber: number;
  externalTransactionId: string;
  timestamp: string; // ISO
  locationName: string;
  employeeIdentifier: string | null;
  itemName: string;
  category: string | null;
  quantity: number;
  price: number;
  discount: number;
  voided: boolean;
  refunded: boolean;
}

export interface RowError {
  rowNumber: number;
  message: string;
}

export interface ValidationResult {
  validRows: NormalizedCsvRow[];
  errors: RowError[];
}

export interface NormalizedTransactionItem {
  itemName: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  voided: boolean;
  refunded: boolean;
}

/** All CSV rows for one transaction_id, aggregated into transaction-level
 * fields plus its line items — everything the importer needs except the
 * organization/location/employee IDs, which only a DB lookup can resolve. */
export interface NormalizedTransactionGroup {
  externalTransactionId: string;
  timestamp: string;
  locationName: string;
  employeeIdentifier: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  refundAmount: number;
  voided: boolean;
  items: NormalizedTransactionItem[];
}
