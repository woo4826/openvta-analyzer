import { describe, expect, it } from "vitest";
import { estimateCalibrationOffsets } from "../calibration";
import type { SensorPoint } from "../types";

describe("estimateCalibrationOffsets", () => {
  it("includes static window boundaries", () => {
    const offsets = estimateCalibrationOffsets(
      [
        sensor({ elapsedSeconds: 0, accelX: 10 }),
        sensor({ elapsedSeconds: 1, accelX: 20 }),
        sensor({ elapsedSeconds: 2, accelX: 30 }),
        sensor({ elapsedSeconds: 3, accelX: 40 }),
      ],
      { startElapsedSeconds: 1, endElapsedSeconds: 2 },
    );

    expect(offsets?.sampleCount).toBe(2);
    expect(offsets?.x).toBe(25);
  });

  it("normalizes reversed static windows", () => {
    const offsets = estimateCalibrationOffsets(
      [
        sensor({ elapsedSeconds: 0, accelX: 10 }),
        sensor({ elapsedSeconds: 1, accelX: 20 }),
        sensor({ elapsedSeconds: 2, accelX: 30 }),
      ],
      { startElapsedSeconds: 2, endElapsedSeconds: 1 },
    );

    expect(offsets?.sampleCount).toBe(2);
    expect(offsets?.x).toBe(25);
  });

  it("returns undefined when the static window contains no samples", () => {
    expect(
      estimateCalibrationOffsets(
        [sensor({ elapsedSeconds: 0 }), sensor({ elapsedSeconds: 1 })],
        { startElapsedSeconds: 5, endElapsedSeconds: 6 },
      ),
    ).toBeUndefined();
  });

  it("uses the first selected acceleration unit and reports the matching sample count", () => {
    const offsets = estimateCalibrationOffsets([
      sensor({ elapsedSeconds: 0, accelUnit: "mps2", accelX: 0.2 }),
      sensor({ elapsedSeconds: 1, accelUnit: "g", accelX: 1.2, accelZ: 1 }),
      sensor({ elapsedSeconds: 2, accelUnit: "mps2", accelX: 0.4 }),
    ]);

    expect(offsets?.unit).toBe("mps2");
    expect(offsets?.sampleCount).toBe(2);
    expect(offsets?.x).toBeCloseTo(0.3);
  });
});

function sensor(overrides: Partial<SensorPoint> = {}): SensorPoint {
  return {
    index: overrides.index ?? 0,
    lineNumber: overrides.lineNumber ?? 1,
    rawLine: overrides.rawLine ?? "#0,0,0,0,0,0,0,0,9.80665",
    elapsedSeconds: overrides.elapsedSeconds ?? 0,
    eventCode: overrides.eventCode ?? 0,
    accelX: overrides.accelX ?? 0,
    accelY: overrides.accelY ?? 0,
    accelZ: overrides.accelZ ?? 9.80665,
    accelUnit: overrides.accelUnit ?? "mps2",
    ...overrides,
  };
}
