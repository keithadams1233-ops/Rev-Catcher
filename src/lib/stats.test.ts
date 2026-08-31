import { describe, it, expect } from "vitest";
import { percentile, mean } from "./stats";

describe("percentile", () => {
  it("returns the single value for a one-element array", () => {
    expect(percentile([5], 0.5)).toBe(5);
  });

  it("returns the median for an odd-length array", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("interpolates between two values", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("returns the min/max at p=0/p=1", () => {
    const sorted = [3, 7, 9, 12, 20];
    expect(percentile(sorted, 0)).toBe(3);
    expect(percentile(sorted, 1)).toBe(20);
  });

  it("throws on an empty array rather than returning a bogus value", () => {
    expect(() => percentile([], 0.5)).toThrow();
  });
});

describe("mean", () => {
  it("averages a set of values", () => {
    expect(mean([2, 4, 6])).toBe(4);
  });

  it("returns 0 for an empty array instead of NaN", () => {
    expect(mean([])).toBe(0);
  });
});
