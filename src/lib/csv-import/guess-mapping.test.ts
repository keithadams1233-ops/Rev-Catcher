import { describe, it, expect } from "vitest";
import { guessMapping } from "./guess-mapping";

describe("guessMapping", () => {
  it("matches common POS export header names", () => {
    const headers = ["Order ID", "Date", "Store", "Cashier", "Item", "Category", "Qty", "Price", "Discount", "Voided", "Refunded"];
    const mapping = guessMapping(headers);
    expect(mapping).toEqual({
      transaction_id: "Order ID",
      timestamp: "Date",
      location: "Store",
      employee: "Cashier",
      item_name: "Item",
      category: "Category",
      quantity: "Qty",
      price: "Price",
      discount: "Discount",
      voided: "Voided",
      refunded: "Refunded",
    });
  });

  it("leaves a field unmapped when nothing matches", () => {
    const mapping = guessMapping(["Order ID", "Mystery Column"]);
    expect(mapping.transaction_id).toBe("Order ID");
    expect(mapping.employee).toBeNull();
  });

  it("never assigns the same header to two fields", () => {
    const mapping = guessMapping(["Total"]);
    const assigned = Object.values(mapping).filter((v) => v !== null);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("prefers an exact match over a looser substring match", () => {
    // "Item" is an exact match for item_name; "Item Category" contains
    // "item" too but shouldn't be stolen by item_name once "Item" exists.
    const mapping = guessMapping(["Item", "Item Category"]);
    expect(mapping.item_name).toBe("Item");
    expect(mapping.category).toBe("Item Category");
  });
});
