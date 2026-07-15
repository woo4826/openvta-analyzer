import { describe, expect, it } from "vitest";
import { synchronizeAccelerationToTrajectory } from "../sensorSynchronization";
import { GRAVITY_MPS2, type GpsPoint, type SegmentTrajectorySample, type SensorPoint } from "../types";

describe("sensor synchronization", () => {
  it("interpolates sensors by monotonic timestamp when both streams provide nanos", () => {
    const result = synchronizeAccelerationToTrajectory(
      pointsWithNanos(),
      [sensor({ lineNumber: 15, timestampNanos: 5_000_000_000, elapsedSeconds: 5 })],
      trajectory(),
    );

    expect(result?.method).toBe("timestamp");
    expect(result?.samples[0]).toMatchObject({ distanceMeters: 50, elapsedSeconds: 5, sourceIndex: 1 });
  });

  it("falls back to VTA line order and converts mps2 to g", () => {
    const result = synchronizeAccelerationToTrajectory(
      pointsByLine(),
      [sensor({ lineNumber: 20, elapsedSeconds: 5, accelX: GRAVITY_MPS2 })],
      trajectory(),
    );

    expect(result?.method).toBe("line-order");
    expect(result?.samples[0]).toMatchObject({ distanceMeters: 50, elapsedSeconds: 5, sourceIndex: 1 });
    expect(result?.samples[0].accelXG).toBeCloseTo(1);
  });

  it("coalesces duplicate effective sensor instants by averaging channels", () => {
    const result = synchronizeAccelerationToTrajectory(
      pointsByLine(),
      [
        sensor({ index: 0, lineNumber: 20, elapsedSeconds: 5, accelX: 0 }),
        sensor({ index: 1, lineNumber: 20, elapsedSeconds: 5, accelX: GRAVITY_MPS2 }),
      ],
      trajectory(),
    );

    expect(result?.samples).toHaveLength(1);
    expect(result?.samples[0].accelXG).toBeCloseTo(0.5);
  });

  it("keeps native g values and drops rows outside the trajectory anchors", () => {
    const result = synchronizeAccelerationToTrajectory(
      pointsByLine(),
      [
        sensor({ index: 0, lineNumber: 5, elapsedSeconds: 0, accelX: 9, accelUnit: "g" }),
        sensor({ index: 1, lineNumber: 20, elapsedSeconds: 5, accelX: 0.25, accelUnit: "g" }),
        sensor({ index: 2, lineNumber: 35, elapsedSeconds: 10, accelX: 9, accelUnit: "g" }),
      ],
      trajectory(),
    );

    expect(result?.samples).toHaveLength(1);
    expect(result?.samples[0].accelXG).toBeCloseTo(0.25);
  });

  it("keeps a narrow resampled scope when every display sample rounds to one source index", () => {
    const narrowTrajectory = [
      trajectorySample({ sourceIndex: 1, sourcePosition: 1.1, distanceMeters: 0, elapsedSeconds: 0 }),
      trajectorySample({ sourceIndex: 1, sourcePosition: 1.4, distanceMeters: 30, elapsedSeconds: 1.5 }),
    ];
    const result = synchronizeAccelerationToTrajectory(
      pointsWithNanos(),
      [sensor({ timestampNanos: 6_250_000_000, elapsedSeconds: 6.25 })],
      narrowTrajectory,
    );

    expect(result?.method).toBe("timestamp");
    expect(result?.samples[0]).toMatchObject({ sourceIndex: 1, distanceMeters: 15, elapsedSeconds: 0.75 });
  });

  it("returns undefined without enough usable anchors or synchronized samples", () => {
    expect(synchronizeAccelerationToTrajectory([], [sensor()], [])).toBeUndefined();
    expect(synchronizeAccelerationToTrajectory(pointsByLine(), [], trajectory())).toBeUndefined();
    expect(synchronizeAccelerationToTrajectory(pointsByLine(), [sensor({ lineNumber: 5 })], trajectory())).toBeUndefined();
  });
});

function pointsWithNanos(): GpsPoint[] {
  return [
    gps({ index: 0, lineNumber: 10, elapsedRealtimeNanos: 0 }),
    gps({ index: 1, lineNumber: 20, elapsedRealtimeNanos: 5_000_000_000 }),
    gps({ index: 2, lineNumber: 30, elapsedRealtimeNanos: 10_000_000_000 }),
  ];
}

function pointsByLine(): GpsPoint[] {
  return [
    gps({ index: 0, lineNumber: 10 }),
    gps({ index: 1, lineNumber: 20 }),
    gps({ index: 2, lineNumber: 30 }),
  ];
}

function trajectory(): SegmentTrajectorySample[] {
  return [
    trajectorySample({ sourceIndex: 0, distanceMeters: 0, elapsedSeconds: 0 }),
    trajectorySample({ sourceIndex: 2, distanceMeters: 100, elapsedSeconds: 10 }),
  ];
}

function gps(overrides: Partial<GpsPoint> = {}): GpsPoint {
  return {
    index: 0,
    lineNumber: 1,
    rawLine: "",
    date: "01012026",
    time: "000000",
    latitude: 37,
    longitude: 128,
    altitudeMeters: 0,
    speedKmh: 80,
    bearingDegrees: 0,
    satelliteCount: 10,
    source: "RawGps",
    confidence: 1,
    ...overrides,
  };
}

function sensor(overrides: Partial<SensorPoint> = {}): SensorPoint {
  return {
    index: 0,
    lineNumber: 20,
    rawLine: "",
    elapsedSeconds: 5,
    eventCode: 0,
    accelX: 0,
    accelY: 0,
    accelZ: GRAVITY_MPS2,
    accelUnit: "mps2",
    ...overrides,
  };
}

function trajectorySample(overrides: Partial<SegmentTrajectorySample> = {}): SegmentTrajectorySample {
  return {
    sourceIndex: 0,
    distanceMeters: 0,
    elapsedSeconds: 0,
    speedKmh: 80,
    latitude: 37,
    longitude: 128,
    referenceElapsedSeconds: 0,
    deltaSeconds: 0,
    pathDistanceMeters: 0,
    signedOffsetMeters: 0,
    ...overrides,
  };
}
