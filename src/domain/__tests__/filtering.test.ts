import { describe, expect, it } from "vitest";
import {
  applyAccelerationFilter,
  FILTER_WARNING_CUTOFF_OUT_OF_RANGE,
  FILTER_WARNING_IRREGULAR_TIMESTAMPS,
} from "../filtering";
import type { SensorPoint } from "../types";

describe("applyAccelerationFilter warnings", () => {
  it("warns when the cutoff frequency is outside the usable range", () => {
    const result = applyAccelerationFilter(regularSensors(), {
      enabled: true,
      cutoffHz: 60,
      channels: { x: true, y: true, z: true },
    });

    expect(result.sampleRateHz).toBeCloseTo(100);
    expect(result.warning).toBe(FILTER_WARNING_CUTOFF_OUT_OF_RANGE);
    expect(result.sensors).toEqual(regularSensors());
  });

  it("warns when sensor timestamps are irregular but still filterable", () => {
    const sensors = irregularSensors();
    const result = applyAccelerationFilter(sensors, {
      enabled: true,
      cutoffHz: 3,
      channels: { x: true, y: false, z: false },
    });

    expect(result.sampleRateHz).toBeCloseTo(100);
    expect(result.warning).toBe(FILTER_WARNING_IRREGULAR_TIMESTAMPS);
    expect(result.sensors).not.toEqual(sensors);
  });
});

function regularSensors(): SensorPoint[] {
  return Array.from({ length: 10 }, (_, index) => sensor({ index, elapsedSeconds: index * 0.01 }));
}

function irregularSensors(): SensorPoint[] {
  return [0, 0.01, 0.02, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11].map((elapsedSeconds, index) =>
    sensor({ index, elapsedSeconds, accelX: index % 2 === 0 ? 1 : -1 }),
  );
}

function sensor(overrides: Partial<SensorPoint> = {}): SensorPoint {
  return {
    index: 0,
    lineNumber: 1,
    rawLine: "",
    elapsedSeconds: 0,
    eventCode: 0,
    accelX: 0,
    accelY: 0,
    accelZ: 9.80665,
    accelUnit: "mps2",
    ...overrides,
  };
}
