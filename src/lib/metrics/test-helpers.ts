import type { EngineTransaction, EngineTransactionItem } from "./types";

let idCounter = 0;

export function item(overrides: Partial<EngineTransactionItem> = {}): EngineTransactionItem {
  return {
    category: null,
    itemName: "Item",
    modifierNames: [],
    quantity: 1,
    totalPrice: 0,
    refunded: false,
    voided: false,
    ...overrides,
  };
}

export function txn(overrides: Partial<EngineTransaction> = {}): EngineTransaction {
  idCounter += 1;
  return {
    id: `txn-${idCounter}`,
    locationId: "loc-1",
    employeeId: "emp-1",
    total: 10,
    refundAmount: 0,
    voided: false,
    items: [],
    ...overrides,
  };
}
