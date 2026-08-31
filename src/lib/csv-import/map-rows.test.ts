import { describe, it, expect } from "vitest";
import { applyMapping } from "./map-rows";
import { EMPTY_MAPPING, type ParsedCsv } from "./types";

describe("applyMapping", () => {
  const parsed: ParsedCsv = {
    headers: ["Order ID", "Item", "Line Total"],
    rows: [["1001", "Burger", "8.50"]],
  };

  it("maps only the fields the manager assigned", () => {
    const mapping = { ...EMPTY_MAPPING, transaction_id: "Order ID", item_name: "Item", price: "Line Total" };
    const result = applyMapping(parsed, mapping);
    expect(result).toEqual([{ transaction_id: "1001", item_name: "Burger", price: "8.50" }]);
  });

  it("ignores a mapping that points at a header the file doesn't have", () => {
    const mapping = { ...EMPTY_MAPPING, transaction_id: "Order ID", category: "Category (missing)" };
    const result = applyMapping(parsed, mapping);
    expect(result[0]).toEqual({ transaction_id: "1001" });
  });

  it("returns an empty object per row when nothing is mapped", () => {
    const result = applyMapping(parsed, EMPTY_MAPPING);
    expect(result).toEqual([{}]);
  });
});
