import { describe, it, expect } from "vitest";
import {
  computeMetric,
  computeMetricForOrganization,
  computeMetricByEmployee,
  computeMetricByLocation,
  DETECTOR_METRIC_CODES,
} from "./index";
import { txn, item } from "./test-helpers";

describe("computeMetric dispatcher", () => {
  it("has a working detector for every code in DETECTOR_METRIC_CODES", () => {
    const transactions = [
      txn({ total: 12, items: [item({ category: "Food" }), item({ category: "Beverage" })] }),
      txn({ total: 14, items: [item({ category: "Food" })] }),
    ];

    for (const code of DETECTOR_METRIC_CODES) {
      const result = computeMetric(code, transactions);
      expect(result.denominator).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.value)).toBe(true);
    }
  });
});

describe("rollups", () => {
  // Two employees at two locations; each has one eligible transaction with
  // a beverage attached and one without, so everyone's individual rate is
  // 50% — but the shape of the rollup (org vs. per-employee vs.
  // per-location) should still differ correctly.
  const transactions = [
    txn({ employeeId: "sarah", locationId: "store-37", items: [item({ category: "Food" }), item({ category: "Beverage" })] }),
    txn({ employeeId: "sarah", locationId: "store-37", items: [item({ category: "Food" })] }),
    txn({ employeeId: "kevin", locationId: "store-52", items: [item({ category: "Food" }), item({ category: "Beverage" })] }),
    txn({ employeeId: "kevin", locationId: "store-52", items: [item({ category: "Food" })] }),
  ];

  it("computeMetricForOrganization treats every transaction as one pool", () => {
    const result = computeMetricForOrganization("beverage_attachment", transactions);
    expect(result).toEqual({ numerator: 2, denominator: 4, value: 0.5 });
  });

  it("computeMetricByEmployee keeps each employee's rate independent", () => {
    const byEmployee = computeMetricByEmployee("beverage_attachment", transactions);
    expect(byEmployee.get("sarah")).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(byEmployee.get("kevin")).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it("computeMetricByLocation keeps each location's rate independent", () => {
    const byLocation = computeMetricByLocation("beverage_attachment", transactions);
    expect(byLocation.get("store-37")).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(byLocation.get("store-52")).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });
});
