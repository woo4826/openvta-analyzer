import { describe, expect, it } from "vitest";
import { projectCoordinateToLineProgress } from "../geometry";

describe("line progress projection", () => {
  it("returns along-line progress and perpendicular offset", () => {
    const projection = projectCoordinateToLineProgress(
      [0.001, 0.0001],
      { type: "LineString", coordinates: [[0, 0], [0.002, 0]] },
    );

    expect(projection.distanceMeters).toBeCloseTo(111.2, 0);
    expect(projection.offsetMeters).toBeCloseTo(11.1, 0);
  });

  it("chooses the closest segment while retaining cumulative progress", () => {
    const projection = projectCoordinateToLineProgress(
      [0.0011, 0.0008],
      { type: "LineString", coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]] },
    );

    expect(projection.distanceMeters).toBeGreaterThan(180);
    expect(projection.distanceMeters).toBeLessThan(210);
    expect(projection.offsetMeters).toBeCloseTo(11.1, 0);
  });
});
