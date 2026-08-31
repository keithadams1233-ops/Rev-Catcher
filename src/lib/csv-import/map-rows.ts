import { CSV_TARGET_FIELDS, type ColumnMapping, type MappedRow, type ParsedCsv } from "./types";

/** Re-shapes raw CSV rows (by column index) into rows keyed by target field,
 * using the manager's column mapping to find each field's source column. */
export function applyMapping(parsed: ParsedCsv, mapping: ColumnMapping): MappedRow[] {
  const indexByHeader = new Map(parsed.headers.map((h, i) => [h, i]));

  return parsed.rows.map((row) => {
    const mapped: MappedRow = {};
    for (const field of CSV_TARGET_FIELDS) {
      const header = mapping[field.key];
      if (!header) continue;
      const index = indexByHeader.get(header);
      if (index === undefined) continue;
      mapped[field.key] = row[index] ?? "";
    }
    return mapped;
  });
}
