import { describe, it, expect } from "vitest";
import { calculateOpportunity, extrapolateEligiblePerMonth } from "./opportunity";

describe("calculateOpportunity", () => {
  it("matches the spec §8 worked example exactly", () => {
    // 10,000 eligible transactions, current 28% -> target 36%, gap 8%,
    // avg beverage sale $3.50 -> $2,800 revenue; 70% margin -> $1,960 profit.
    const result = calculateOpportunity({
      metricCode: "beverage_attachment",
      currentValue: 0.28,
      benchmarkValue: 0.36,
      eligibleTransactionsPerMonth: 10_000,
      avgAttachedItemPrice: 3.5,
    });

    expect(result.gap).toBeCloseTo(0.08, 6);
    expect(result.estimatedIncrementalRevenue).toBe(2800);
    expect(result.estimatedContributionProfit).toBe(1960);
  });

  it("returns zeroed results when current value already meets or beats the benchmark", () => {
    const atBenchmark = calculateOpportunity({
      metricCode: "beverage_attachment",
      currentValue: 0.4,
      benchmarkValue: 0.4,
      eligibleTransactionsPerMonth: 10_000,
      avgAttachedItemPrice: 3.5,
    });
    const aboveBenchmark = calculateOpportunity({
      metricCode: "beverage_attachment",
      currentValue: 0.45,
      benchmarkValue: 0.4,
      eligibleTransactionsPerMonth: 10_000,
      avgAttachedItemPrice: 3.5,
    });

    for (const result of [atBenchmark, aboveBenchmark]) {
      expect(result.estimatedIncrementalRevenue).toBe(0);
      expect(result.estimatedContributionProfit).toBe(0);
    }
  });

  it("treats average_ticket's gap as an already-dollar amount, not multiplied by an item price", () => {
    const result = calculateOpportunity({
      metricCode: "average_ticket",
      currentValue: 12,
      benchmarkValue: 14,
      eligibleTransactionsPerMonth: 1000,
      avgAttachedItemPrice: 999, // must be ignored for this metric
    });

    expect(result.gap).toBe(2);
    expect(result.estimatedIncrementalRevenue).toBe(2000); // 1000 x $2, not x $999
  });

  it("respects a custom margin override instead of the default", () => {
    const result = calculateOpportunity({
      metricCode: "beverage_attachment",
      currentValue: 0.28,
      benchmarkValue: 0.36,
      eligibleTransactionsPerMonth: 10_000,
      avgAttachedItemPrice: 3.5,
      marginOverride: 0.5,
    });
    expect(result.estimatedContributionProfit).toBe(1400); // 2800 x 0.5
  });
});

describe("extrapolateEligiblePerMonth", () => {
  it("scales a shorter period up to a 30-day month", () => {
    // 7-day period with 70 eligible transactions -> 10/day -> 300/month
    const result = extrapolateEligiblePerMonth(70, "2026-01-01", "2026-01-07");
    expect(result).toBeCloseTo(300, 0);
  });

  it("leaves a 30-day period roughly unscaled", () => {
    const result = extrapolateEligiblePerMonth(300, "2026-01-01", "2026-01-30");
    expect(result).toBeCloseTo(300, 0);
  });
});
