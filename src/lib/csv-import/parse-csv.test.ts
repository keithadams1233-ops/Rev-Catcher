import { describe, it, expect } from "vitest";
import { parseCsv } from "./parse-csv";

describe("parseCsv", () => {
  it("parses a simple comma-separated file with a header row", () => {
    const text = "transaction_id,item_name,price\n1001,Burger,8.50\n1002,Fries,3.00\n";
    const result = parseCsv(text);
    expect(result.headers).toEqual(["transaction_id", "item_name", "price"]);
    expect(result.rows).toEqual([
      ["1001", "Burger", "8.50"],
      ["1002", "Fries", "3.00"],
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    const text = 'id,name\n1,"Burger, Deluxe"\n';
    const result = parseCsv(text);
    expect(result.rows).toEqual([["1", "Burger, Deluxe"]]);
  });

  it("handles escaped double quotes inside a quoted field", () => {
    const text = 'id,name\n1,"12\\" Pizza"\n';
    // Deliberately not using a backslash escape (CSV doesn't use one) —
    // real CSV escapes a quote by doubling it: "" inside a quoted field.
    const doubled = 'id,name\n1,"12"" Pizza"\n';
    const result = parseCsv(doubled);
    expect(result.rows).toEqual([["1", '12" Pizza']]);
    // sanity: the backslash variant is untouched, just documenting intent
    expect(text).toContain("\\");
  });

  it("handles embedded newlines inside a quoted field", () => {
    const text = 'id,notes\n1,"line one\nline two"\n2,plain\n';
    const result = parseCsv(text);
    expect(result.rows).toEqual([
      ["1", "line one\nline two"],
      ["2", "plain"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const text = "id,name\r\n1,Burger\r\n2,Fries\r\n";
    const result = parseCsv(text);
    expect(result.rows).toEqual([
      ["1", "Burger"],
      ["2", "Fries"],
    ]);
  });

  it("skips blank lines", () => {
    const text = "id,name\n1,Burger\n\n2,Fries\n\n";
    const result = parseCsv(text);
    expect(result.rows).toEqual([
      ["1", "Burger"],
      ["2", "Fries"],
    ]);
  });

  it("returns empty rows for a header-only file", () => {
    const result = parseCsv("id,name\n");
    expect(result.headers).toEqual(["id", "name"]);
    expect(result.rows).toEqual([]);
  });
});
