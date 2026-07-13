import { describe, expect, it } from "vitest";
import type { SensorPoint } from "../../domain/types";
import { isFilterTransformReady, normalizeTransformMode } from "../workspaceCapabilities";

describe("isFilterTransformReady", () => {
  it("requires an enabled filter that produced a distinct sensor result", () => {
    const calibratedSensors = [] as SensorPoint[];
    const filteredSensors = [] as SensorPoint[];

    expect(isFilterTransformReady(true, calibratedSensors, calibratedSensors)).toBe(false);
    expect(isFilterTransformReady(false, calibratedSensors, filteredSensors)).toBe(false);
    expect(isFilterTransformReady(true, calibratedSensors, filteredSensors)).toBe(true);
  });

  it("falls back to raw when a selected transform loses its prerequisite", () => {
    expect(normalizeTransformMode("calibrated", false, true)).toBe("raw");
    expect(normalizeTransformMode("filtered", true, false)).toBe("raw");
    expect(normalizeTransformMode("compare", false, false)).toBe("raw");
    expect(normalizeTransformMode("compare", true, false)).toBe("compare");
  });
});
