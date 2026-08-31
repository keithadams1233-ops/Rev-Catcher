import { describe, it, expect } from "vitest";
import { classifyConfidence, FULL_CONFIDENCE_SAMPLE_SIZE } from "./confidence";
import { confidenceLabel } from "@/lib/format";

describe("classifyConfidence", () => {
  it("scores near zero for a tiny sample with no comparable locations", () => {
    const score = classifyConfidence(2, 0);
    expect(score).toBeLessThan(0.1);
    expect(confidenceLabel(score)).toBe("Low");
  });

  it("scores at the top for a full sample backed by a top-quartile benchmark", () => {
    const score = classifyConfidence(FULL_CONFIDENCE_SAMPLE_SIZE, 5);
    expect(score).toBe(1);
    expect(confidenceLabel(score)).toBe("High");
  });

  it("caps the sample-size contribution rather than rewarding samples beyond the full-confidence size", () => {
    const atFull = classifyConfidence(FULL_CONFIDENCE_SAMPLE_SIZE, 5);
    const wayOverFull = classifyConfidence(FULL_CONFIDENCE_SAMPLE_SIZE * 10, 5);
    expect(wayOverFull).toBe(atFull);
  });

  it("scores a two-location-average benchmark lower than a top-quartile one, all else equal", () => {
    const twoLocations = classifyConfidence(50, 2);
    const quartile = classifyConfidence(50, 5);
    expect(twoLocations).toBeLessThan(quartile);
  });
});
