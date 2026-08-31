import { describe, it, expect } from "vitest";
import { byEmployee, byLocation, groupTransactionsBy } from "./aggregate";
import { txn } from "./test-helpers";

describe("groupTransactionsBy", () => {
  it("groups by an arbitrary key and drops null-keyed transactions", () => {
    const transactions = [
      txn({ id: "a", employeeId: "e1" }),
      txn({ id: "b", employeeId: "e1" }),
      txn({ id: "c", employeeId: "e2" }),
      txn({ id: "d", employeeId: null }),
    ];

    const groups = groupTransactionsBy(transactions, (t) => t.employeeId);
    expect([...groups.keys()].sort()).toEqual(["e1", "e2"]);
    expect(groups.get("e1")).toHaveLength(2);
    expect(groups.get("e2")).toHaveLength(1);
  });
});

describe("byEmployee / byLocation", () => {
  it("groups the same transaction set differently by employee vs. location", () => {
    const transactions = [
      txn({ id: "a", employeeId: "e1", locationId: "loc-1" }),
      txn({ id: "b", employeeId: "e2", locationId: "loc-1" }),
      txn({ id: "c", employeeId: "e1", locationId: "loc-2" }),
    ];

    expect(byEmployee(transactions).get("e1")).toHaveLength(2);
    expect(byLocation(transactions).get("loc-1")).toHaveLength(2);
    expect(byLocation(transactions).get("loc-2")).toHaveLength(1);
  });
});
