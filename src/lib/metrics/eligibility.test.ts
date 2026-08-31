import { describe, it, expect } from "vitest";
import { isCleanTransaction, isCleanItem, excludeOutliers, MIN_SAMPLE_SIZE_FOR_OUTLIER_EXCLUSION } from "./eligibility";
import { txn, item } from "./test-helpers";

describe("isCleanTransaction", () => {
  it("accepts a normal transaction", () => {
    expect(isCleanTransaction(txn())).toBe(true);
  });

  it("rejects a voided transaction", () => {
    expect(isCleanTransaction(txn({ voided: true }))).toBe(false);
  });

  it("rejects a transaction with any refund amount, even partial", () => {
    expect(isCleanTransaction(txn({ refundAmount: 0.01 }))).toBe(false);
    expect(isCleanTransaction(txn({ refundAmount: 10 }))).toBe(false);
  });
});

describe("isCleanItem", () => {
  it("accepts a normal item", () => {
    expect(isCleanItem(item())).toBe(true);
  });

  it("rejects a voided or refunded item independently of its transaction", () => {
    expect(isCleanItem(item({ voided: true }))).toBe(false);
    expect(isCleanItem(item({ refunded: true }))).toBe(false);
  });
});

describe("excludeOutliers", () => {
  it("keeps everything below the minimum sample size, however extreme", () => {
    const values = Array.from({ length: MIN_SAMPLE_SIZE_FOR_OUTLIER_EXCLUSION - 2 }, () => 10);
    values.push(10_000); // a wild outlier that shouldn't get dropped in a tiny sample
    expect(values.length).toBeLessThan(MIN_SAMPLE_SIZE_FOR_OUTLIER_EXCLUSION);
    expect(excludeOutliers(values)).toHaveLength(values.length);
  });

  it("drops values outside 1.5x IQR once there's enough data", () => {
    // 8 normal tickets clustered around $12-15, plus one $500 outlier.
    const normal = [12, 12.5, 13, 13.5, 14, 14.5, 15];
    const values = [...normal, 500];
    expect(values.length).toBeGreaterThanOrEqual(MIN_SAMPLE_SIZE_FOR_OUTLIER_EXCLUSION);

    const result = excludeOutliers(values);
    expect(result).not.toContain(500);
    expect(result).toHaveLength(normal.length);
  });

  it("keeps a tight, outlier-free cluster intact", () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 17];
    expect(excludeOutliers(values)).toEqual(values);
  });
});
