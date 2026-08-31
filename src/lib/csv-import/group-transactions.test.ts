import { describe, it, expect } from "vitest";
import { groupIntoTransactions } from "./group-transactions";
import type { NormalizedCsvRow } from "./types";

let rowCounter = 0;
function csvRow(overrides: Partial<NormalizedCsvRow> = {}): NormalizedCsvRow {
  rowCounter += 1;
  return {
    rowNumber: rowCounter,
    externalTransactionId: "1001",
    timestamp: "2026-01-15T12:00:00.000Z",
    locationName: "Store #37",
    employeeIdentifier: null,
    itemName: "Item",
    category: null,
    quantity: 1,
    price: 10,
    discount: 0,
    voided: false,
    refunded: false,
    ...overrides,
  };
}

describe("groupIntoTransactions", () => {
  it("groups multiple line-item rows sharing a transaction ID into one transaction", () => {
    const rows = [
      csvRow({ itemName: "Burger", price: 8.5 }),
      csvRow({ itemName: "Fries", price: 3 }),
    ];

    const [group] = groupIntoTransactions(rows);
    expect(group.externalTransactionId).toBe("1001");
    expect(group.items).toHaveLength(2);
    expect(group.subtotal).toBe(11.5);
    expect(group.total).toBe(11.5);
  });

  it("subtracts discount from subtotal for the total", () => {
    const rows = [csvRow({ price: 10, discount: 2 })];
    const [group] = groupIntoTransactions(rows);
    expect(group.subtotal).toBe(10);
    expect(group.discountTotal).toBe(2);
    expect(group.total).toBe(8);
  });

  it("back-derives unit price from the line total and quantity", () => {
    const rows = [csvRow({ price: 15, quantity: 3 })];
    const [group] = groupIntoTransactions(rows);
    expect(group.items[0].unitPrice).toBe(5);
    expect(group.items[0].totalPrice).toBe(15);
  });

  it("marks the transaction voided only when every item in it was voided", () => {
    const partiallyVoided = groupIntoTransactions([
      csvRow({ itemName: "Burger", voided: true }),
      csvRow({ itemName: "Fries", voided: false }),
    ])[0];
    expect(partiallyVoided.voided).toBe(false);
    expect(partiallyVoided.items.find((i) => i.itemName === "Burger")?.voided).toBe(true);

    const fullyVoided = groupIntoTransactions([
      csvRow({ itemName: "Burger", voided: true }),
      csvRow({ itemName: "Fries", voided: true }),
    ])[0];
    expect(fullyVoided.voided).toBe(true);
  });

  it("sums only refunded items' line totals into refundAmount", () => {
    const rows = [
      csvRow({ itemName: "Burger", price: 8.5, refunded: true }),
      csvRow({ itemName: "Fries", price: 3, refunded: false }),
    ];
    const [group] = groupIntoTransactions(rows);
    expect(group.refundAmount).toBe(8.5);
  });

  it("takes the first non-null employee identifier across the group's rows", () => {
    const rows = [
      csvRow({ employeeIdentifier: null }),
      csvRow({ employeeIdentifier: "sarah@revcatcher.demo" }),
    ];
    const [group] = groupIntoTransactions(rows);
    expect(group.employeeIdentifier).toBe("sarah@revcatcher.demo");
  });

  it("splits rows into separate groups by transaction ID", () => {
    const rows = [
      csvRow({ externalTransactionId: "1001" }),
      csvRow({ externalTransactionId: "1002" }),
    ];
    const groups = groupIntoTransactions(rows);
    expect(groups.map((g) => g.externalTransactionId).sort()).toEqual(["1001", "1002"]);
  });
});
