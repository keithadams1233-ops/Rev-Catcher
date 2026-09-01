import { describe, it, expect } from "vitest";
import { item, txn } from "../metrics/test-helpers";
import { classifyMissionKind, computeMissionProgress, MIN_SAMPLE_FOR_RATE_MISSION } from "./mission-progress";

function beverageTxn(withBeverage: boolean) {
  return txn({
    items: [
      item({ category: "food" }),
      ...(withBeverage ? [item({ category: "beverage" })] : []),
    ],
  });
}

describe("classifyMissionKind", () => {
  it("treats anything above 1 as a count target", () => {
    expect(classifyMissionKind(5)).toBe("count");
    expect(classifyMissionKind(2)).toBe("count");
  });

  it("treats 1 and below as a rate target", () => {
    expect(classifyMissionKind(0.5)).toBe("rate");
    expect(classifyMissionKind(1)).toBe("rate");
  });
});

describe("computeMissionProgress — count mission (e.g. 'First 5 Wins')", () => {
  it("tracks the raw numerator and completes once it reaches the target", () => {
    const transactions = [beverageTxn(true), beverageTxn(true), beverageTxn(false)];
    const result = computeMissionProgress("beverage_attachment", 5, transactions);
    expect(result.currentValue).toBe(2);
    expect(result.completed).toBe(false);
  });

  it("completes exactly on reaching the target count", () => {
    const transactions = Array.from({ length: 5 }, () => beverageTxn(true));
    const result = computeMissionProgress("beverage_attachment", 5, transactions);
    expect(result.currentValue).toBe(5);
    expect(result.completed).toBe(true);
  });
});

describe("computeMissionProgress — rate mission (e.g. 'Perfect Hour')", () => {
  it("never completes below the minimum sample size, even at 100%", () => {
    const transactions = Array.from({ length: MIN_SAMPLE_FOR_RATE_MISSION - 1 }, () => beverageTxn(true));
    const result = computeMissionProgress("beverage_attachment", 0.5, transactions);
    expect(result.currentValue).toBe(1);
    expect(result.completed).toBe(false);
  });

  it("completes once the rate and the sample floor are both met", () => {
    const transactions = [
      ...Array.from({ length: MIN_SAMPLE_FOR_RATE_MISSION }, () => beverageTxn(true)),
    ];
    const result = computeMissionProgress("beverage_attachment", 0.5, transactions);
    expect(result.currentValue).toBe(1);
    expect(result.completed).toBe(true);
  });

  it("does not complete when the sample floor is met but the rate falls short", () => {
    const attached = Array.from({ length: 4 }, () => beverageTxn(true));
    const unattached = Array.from({ length: 6 }, () => beverageTxn(false));
    const result = computeMissionProgress("beverage_attachment", 0.5, [...attached, ...unattached]);
    expect(result.currentValue).toBeCloseTo(0.4, 5);
    expect(result.completed).toBe(false);
  });
});
