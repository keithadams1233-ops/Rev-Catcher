import { describe, it, expect } from "vitest";
import { computeActualImpact, computeRewardRoi } from "./compute-roi";

describe("computeActualImpact", () => {
  it("matches the spec §8 worked example when before/after stand in for current/benchmark", () => {
    // Same numbers as revenue-leaks/opportunity.test.ts's worked example:
    // 10,000 eligible transactions, 28% -> 36%, $3.50 avg beverage sale,
    // 70% margin -> $2,800 revenue / $1,960 profit.
    const result = computeActualImpact({
      metricCode: "beverage_attachment",
      beforeValue: 0.28,
      afterValue: 0.36,
      eligibleTransactionsPerMonth: 10_000,
      avgAttachedItemPrice: 3.5,
      marginOverride: 0.7,
    });

    expect(result.actualGap).toBeCloseTo(0.08, 5);
    expect(result.actualIncrementalRevenue).toBe(2800);
    expect(result.actualContributionProfit).toBe(1960);
  });

  it("zeroes out revenue/profit (but keeps the real signed gap) when the metric regressed", () => {
    const result = computeActualImpact({
      metricCode: "beverage_attachment",
      beforeValue: 0.36,
      afterValue: 0.28,
      eligibleTransactionsPerMonth: 10_000,
      avgAttachedItemPrice: 3.5,
    });

    expect(result.actualGap).toBeCloseTo(-0.08, 5);
    expect(result.actualIncrementalRevenue).toBe(0);
    expect(result.actualContributionProfit).toBe(0);
  });

  it("zeroes out when the metric didn't move at all", () => {
    const result = computeActualImpact({
      metricCode: "beverage_attachment",
      beforeValue: 0.3,
      afterValue: 0.3,
      eligibleTransactionsPerMonth: 5000,
      avgAttachedItemPrice: 4,
    });

    expect(result.actualContributionProfit).toBe(0);
  });

  it("drops the item-price term for average_ticket, same as the projected formula", () => {
    const result = computeActualImpact({
      metricCode: "average_ticket",
      beforeValue: 18,
      afterValue: 20,
      eligibleTransactionsPerMonth: 1000,
      avgAttachedItemPrice: 999, // must be ignored
      marginOverride: 0.5,
    });

    expect(result.actualIncrementalRevenue).toBe(2000); // 1000 * (20 - 18)
    expect(result.actualContributionProfit).toBe(1000);
  });
});

describe("computeRewardRoi", () => {
  it("is profit per reward dollar spent", () => {
    expect(computeRewardRoi(1960, 400)).toBeCloseTo(4.9, 5);
  });

  it("returns Infinity for a free reward that still recovered profit", () => {
    expect(computeRewardRoi(500, 0)).toBe(Infinity);
  });

  it("is zero when nothing was actually recovered", () => {
    expect(computeRewardRoi(0, 400)).toBe(0);
  });
});
