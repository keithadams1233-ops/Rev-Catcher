import type { ParsedCsv } from "./types";

/**
 * A small RFC4180-ish CSV parser: quoted fields, embedded commas/newlines,
 * `""` as an escaped quote, CRLF or LF line endings. Not a full spec
 * implementation (no alternate delimiters/encodings) — POS exports are
 * comma-separated UTF-8, and that's the one thing this needs to parse
 * correctly.
 */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === ",") {
      pushField();
      i += 1;
    } else if (char === "\r") {
      i += 1; // normalized away — the following \n (if any) ends the row
    } else if (char === "\n") {
      pushRow();
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  const nonBlankRows = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  const [headerRow, ...dataRows] = nonBlankRows;
  const headers = (headerRow ?? []).map((h) => h.trim());

  return { headers, rows: dataRows };
}
