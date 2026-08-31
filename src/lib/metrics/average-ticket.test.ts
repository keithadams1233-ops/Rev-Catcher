import { describe, it, expect } from "vitest";
import { calculateAverageTicket } from "./average-ticket";
import { txn } from "./test-helpers";

describe("calculateAverageTicket", () => {
  it("averages clean transaction totals", () => {
    const transactions = [10, 12, 14].map((total) => txn({ total }));
    const result = calculateAverageTicket(transactions);
    expect(result).toEqual({ numerator: 36, denominator: 3, value: 12 });
  });

  it("excludes voided and refunded transactions from both the sum and the count", () => {
    const transactions = [
      txn({ total: 10 }),
      txn({ total: 1000, voided: true }),
      txn({ total: 1000, refundAmount: 1000 }),
    ];

    const result = calculateAverageTicket(transactions);
    expect(result).toEqual({ numerator: 10, denominator: 1, value: 10 });
  });

  it("excludes extreme outliers once there's enough data", () => {
    const normal = [12, 12.5, 13, 13.5, 14, 14.5, 15]; // 7 clustered tickets
    const transactions = [...normal, 900].map((total) => txn({ total })); // + one wild outlier = 8 total

    const result = calculateAverageTicket(transactions);
    const expectedAverage = normal.reduce((a, b) => a + b, 0) / normal.length;

    expect(result.denominator).toBe(normal.length);
    expect(result.value).toBeCloseTo(expectedAverage, 2);
  });

  it("returns 0, not NaN, with no clean transactions", () => {
    const result = calculateAverageTicket([txn({ voided: true })]);
    expect(result).toEqual({ numerator: 0, denominator: 0, value: 0 });
  });
});
