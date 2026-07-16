import { describe, expect, it } from "vitest";
import {
  prepareAccelerationSynchronization,
  synchronizeAccelerationToTrajectory,
  synchronizeAccelerationWithContext,
} from "../sensorSynchronization";
import { GRAVITY_MPS2, type GpsPoint, type SegmentTrajectorySample, type SensorPoint } from "../types";

describe("sensor synchronization", () => {
  it("reuses one prepared GPS/sensor context across multiple lap trajectories", () => {
    const points = pointsWithNanos();
    const sensors = [sensor({ lineNumber: 15, timestampNanos: 5_000_000_000, elapsedSeconds: 5 })];
    const context = prepareAccelerationSynchronization(points, sensors);

    expect(context).toBeDefined();
    expect(synchronizeAccelerationWithContext(context!, trajectory())).toEqual(
      synchronizeAccelerationToTrajectory(points, sensors, trajectory()),
    );
    expect(synchronizeAccelerationWithContext(context!, [
      trajectorySample({ sourceIndex: 0, distanceMeters: 0, elapsedSeconds: 0 }),
      trajectorySample({ sourceIndex: 2, distanceMeters: 200, elapsedSeconds: 20 }),
    ])?.samples[0]).toMatchObject({ distanceMeters: 100, elapsedSeconds: 10 });
  });

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

  it("maps asymmetric sensor rows by inferred sensor clock instead of line density", () => {
    const result = synchronizeAccelerationToTrajectory(
      [gps({ index: 0, lineNumber: 10 }), gps({ index: 1, lineNumber: 90 })],
      [
        sensor({ index: 0, lineNumber: 9, elapsedSeconds: 0 }),
        sensor({ index: 1, lineNumber: 11, elapsedSeconds: 0 }),
        sensor({ index: 2, lineNumber: 20, elapsedSeconds: 5 }),
        sensor({ index: 3, lineNumber: 89, elapsedSeconds: 10 }),
        sensor({ index: 4, lineNumber: 91, elapsedSeconds: 10 }),
      ],
      [
        trajectorySample({ sourceIndex: 0, sourcePosition: 0, distanceMeters: 0, elapsedSeconds: 0 }),
        trajectorySample({ sourceIndex: 1, sourcePosition: 1, distanceMeters: 100, elapsedSeconds: 10 }),
      ],
    );

    expect(result?.method).toBe("sensor-clock");
    expect(result?.samples.find((sample) => sample.sensorIndex === 2)).toMatchObject({
      distanceMeters: 50,
      elapsedSeconds: 5,
      sourceIndex: 1,
    });
  });

  it("interpolates inferred sensor clocks for fractional trajectory source positions", () => {
    const result = synchronizeAccelerationToTrajectory(
      [gps({ index: 0, lineNumber: 10 }), gps({ index: 1, lineNumber: 90 })],
      [
        sensor({ index: 0, lineNumber: 9, elapsedSeconds: 0 }),
        sensor({ index: 1, lineNumber: 11, elapsedSeconds: 0 }),
        sensor({ index: 2, lineNumber: 20, elapsedSeconds: 5 }),
        sensor({ index: 3, lineNumber: 89, elapsedSeconds: 10 }),
        sensor({ index: 4, lineNumber: 91, elapsedSeconds: 10 }),
      ],
      [
        trajectorySample({ sourceIndex: 0, sourcePosition: 0.25, distanceMeters: 0, elapsedSeconds: 0 }),
        trajectorySample({ sourceIndex: 1, sourcePosition: 0.75, distanceMeters: 100, elapsedSeconds: 10 }),
      ],
    );

    expect(result?.method).toBe("sensor-clock");
    expect(result?.samples.find((sample) => sample.sensorIndex === 2)).toMatchObject({
      distanceMeters: 50,
      elapsedSeconds: 5,
      sourceIndex: 1,
    });
  });

  it("does not extrapolate a sensor clock for unbracketed GPS rows", () => {
    const result = synchronizeAccelerationToTrajectory(
      [
        gps({ index: 0, lineNumber: 5 }),
        gps({ index: 1, lineNumber: 20 }),
        gps({ index: 2, lineNumber: 40 }),
      ],
      [
        sensor({ index: 0, lineNumber: 10, elapsedSeconds: 0 }),
        sensor({ index: 1, lineNumber: 15, elapsedSeconds: 1 }),
        sensor({ index: 2, lineNumber: 25, elapsedSeconds: 5 }),
        sensor({ index: 3, lineNumber: 35, elapsedSeconds: 9 }),
        sensor({ index: 4, lineNumber: 45, elapsedSeconds: 11 }),
      ],
      [
        trajectorySample({ sourceIndex: 0, distanceMeters: 0, elapsedSeconds: 0 }),
        trajectorySample({ sourceIndex: 1, distanceMeters: 50, elapsedSeconds: 5 }),
        trajectorySample({ sourceIndex: 2, distanceMeters: 100, elapsedSeconds: 10 }),
      ],
    );

    expect(result?.method).toBe("sensor-clock");
    expect(result?.samples.map((sample) => sample.sensorIndex)).not.toContain(1);
  });

  it("drops nonmonotonic inferred sensor-clock anchors", () => {
    const result = synchronizeAccelerationToTrajectory(
      [
        gps({ index: 0, lineNumber: 10 }),
        gps({ index: 1, lineNumber: 20 }),
        gps({ index: 2, lineNumber: 30 }),
        gps({ index: 3, lineNumber: 40 }),
      ],
      [
        sensor({ index: 0, lineNumber: 9, elapsedSeconds: 0 }),
        sensor({ index: 1, lineNumber: 11, elapsedSeconds: 0 }),
        sensor({ index: 2, lineNumber: 19, elapsedSeconds: 10 }),
        sensor({ index: 3, lineNumber: 21, elapsedSeconds: 10 }),
        sensor({ index: 4, lineNumber: 29, elapsedSeconds: 5 }),
        sensor({ index: 5, lineNumber: 31, elapsedSeconds: 5 }),
        sensor({ index: 6, lineNumber: 35, elapsedSeconds: 15 }),
        sensor({ index: 7, lineNumber: 39, elapsedSeconds: 20 }),
        sensor({ index: 8, lineNumber: 41, elapsedSeconds: 20 }),
      ],
      [
        trajectorySample({ sourceIndex: 0, distanceMeters: 0, elapsedSeconds: 0 }),
        trajectorySample({ sourceIndex: 1, distanceMeters: 100, elapsedSeconds: 10 }),
        trajectorySample({ sourceIndex: 2, distanceMeters: 900, elapsedSeconds: 20 }),
        trajectorySample({ sourceIndex: 3, distanceMeters: 1_000, elapsedSeconds: 30 }),
      ],
    );

    expect(result?.method).toBe("sensor-clock");
    expect(result?.samples.find((sample) => sample.sensorIndex === 6)?.distanceMeters).toBeCloseTo(550);
    expect(result?.samples.map((sample) => sample.sensorIndex)).not.toEqual(expect.arrayContaining([4, 5]));
  });

  it("falls back to line order when fewer than two monotonic sensor-clock anchors survive", () => {
    const result = synchronizeAccelerationToTrajectory(
      [gps({ index: 0, lineNumber: 10 }), gps({ index: 1, lineNumber: 20 })],
      [
        sensor({ index: 0, lineNumber: 9, elapsedSeconds: 10 }),
        sensor({ index: 1, lineNumber: 11, elapsedSeconds: 10 }),
        sensor({ index: 2, lineNumber: 19, elapsedSeconds: 5 }),
        sensor({ index: 3, lineNumber: 21, elapsedSeconds: 5 }),
      ],
      [
        trajectorySample({ sourceIndex: 0, distanceMeters: 0, elapsedSeconds: 0 }),
        trajectorySample({ sourceIndex: 1, distanceMeters: 100, elapsedSeconds: 10 }),
      ],
    );

    expect(result?.method).toBe("line-order");
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
