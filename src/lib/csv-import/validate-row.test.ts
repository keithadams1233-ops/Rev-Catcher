import { describe, it, expect } from "vitest";
import { validateRows } from "./validate-row";
import type { MappedRow } from "./types";

function row(overrides: MappedRow = {}): MappedRow {
  return {
    transaction_id: "1001",
    timestamp: "2026-01-15T12:00:00Z",
    location: "Store #37",
    item_name: "Burger",
    quantity: "1",
    price: "8.50",
    ...overrides,
  };
}

describe("validateRows", () => {
  it("accepts a fully valid row and coerces numeric/boolean fields", () => {
    const { validRows, errors } = validateRows([row()]);
    expect(errors).toEqual([]);
    expect(validRows).toHaveLength(1);
    expect(validRows[0]).toMatchObject({
      externalTransactionId: "1001",
      locationName: "Store #37",
      itemName: "Burger",
      quantity: 1,
      price: 8.5,
      discount: 0,
      voided: false,
      refunded: false,
    });
  });

  it("rejects a row missing a required field, with a specific reason", () => {
    const { validRows, errors } = validateRows([row({ transaction_id: "" })]);
    expect(validRows).toEqual([]);
    expect(errors).toEqual([{ rowNumber: 2, message: "Missing transaction ID" }]);
  });

  it("rejects a row with an unparseable timestamp", () => {
    const { errors } = validateRows([row({ timestamp: "not a date" })]);
    expect(errors[0].message).toContain("Unrecognized timestamp");
  });

  it("rejects a zero or negative quantity", () => {
    const { errors: zero } = validateRows([row({ quantity: "0" })]);
    const { errors: negative } = validateRows([row({ quantity: "-2" })]);
    expect(zero[0].message).toContain("Invalid quantity");
    expect(negative[0].message).toContain("Invalid quantity");
  });

  it("strips currency symbols and thousands separators from money fields", () => {
    const { validRows } = validateRows([row({ price: "$1,234.56" })]);
    expect(validRows[0].price).toBe(1234.56);
  });

  it("parses common truthy spellings for voided/refunded, case-insensitively", () => {
    for (const truthy of ["true", "TRUE", "1", "yes", "Y"]) {
      const { validRows } = validateRows([row({ voided: truthy })]);
      expect(validRows[0].voided).toBe(true);
    }
    for (const falsy of ["false", "0", "no", "", "n"]) {
      const { validRows } = validateRows([row({ refunded: falsy })]);
      expect(validRows[0].refunded).toBe(false);
    }
  });

  it("continues past a bad row and still returns the valid ones", () => {
    const { validRows, errors } = validateRows([row({ transaction_id: "" }), row({ transaction_id: "1002" })]);
    expect(validRows).toHaveLength(1);
    expect(validRows[0].externalTransactionId).toBe("1002");
    expect(errors).toHaveLength(1);
  });

  it("numbers rows starting at 2, accounting for the header row", () => {
    const { errors } = validateRows([row(), row({ transaction_id: "" })]);
    expect(errors[0].rowNumber).toBe(3);
  });
});
