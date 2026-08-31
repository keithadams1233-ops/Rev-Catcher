import { describe, it, expect } from "vitest";
import { computeBenchmark, MIN_LOCATIONS_FOR_QUARTILE_BENCHMARK } from "./benchmark";
import { mean } from "@/lib/stats";

describe("computeBenchmark", () => {
  it("returns null when there's no second location to compare against", () => {
    expect(computeBenchmark([])).toBeNull();
    expect(computeBenchmark([0.3])).toBeNull();
  });

  it("falls back to organization average with 2-3 comparable locations", () => {
    const result = computeBenchmark([0.2, 0.4]);
    expect(result?.source).toBe("organization_average");
    expect(result?.comparableLocationCount).toBe(2);
    expect(result?.value).toBeCloseTo(0.3, 6);
  });

  it("uses the top-performing quartile once there are enough locations", () => {
    const values = [0.2, 0.25, 0.3, 0.35, 0.4]; // 5 locations, >= MIN_LOCATIONS_FOR_QUARTILE_BENCHMARK
    expect(values.length).toBeGreaterThanOrEqual(MIN_LOCATIONS_FOR_QUARTILE_BENCHMARK);
    const result = computeBenchmark(values);
    expect(result?.source).toBe("top_quartile");
    expect(result?.comparableLocationCount).toBe(5);
    // 75th percentile of 5 sorted values lands exactly on the 4th (index 3).
    expect(result?.value).toBeCloseTo(0.35, 6);
    expect(result?.value).toBeGreaterThan(mean(values)); // the top quartile beats the plain average
  });

  it("is order-independent", () => {
    const a = computeBenchmark([0.4, 0.1, 0.3, 0.2, 0.35]);
    const b = computeBenchmark([0.1, 0.2, 0.3, 0.35, 0.4]);
    expect(a).toEqual(b);
  });
});
