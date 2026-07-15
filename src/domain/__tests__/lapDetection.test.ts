import { describe, expect, it } from "vitest";
import type { GpsPoint, TrackGate } from "../types";
import { createGateFromRoutePoint, detectGateCrossings, detectLaps, inferStartFinishGate } from "../lapDetection";

describe("lap detection", () => {
  it("infers a repeatable start/finish gate after a non-repeating pit exit", () => {
    const points = [
      gps(-0.0015, -0.0015, 0),
      gps(-0.001, -0.001, 1),
      ...repeatedCircuitPoints(2),
    ];

    const gate = inferStartFinishGate(points);
    const result = gate ? detectLaps(points, gate) : undefined;

    expect(gate).toBeDefined();
    expect(result?.laps.filter((lap) => lap.completion === "complete").length).toBeGreaterThanOrEqual(1);
  });

  it("does not invent a start/finish gate for an open route", () => {
    const points = Array.from({ length: 20 }, (_, index) => gps(index * 0.0002, 0, index));

    expect(inferStartFinishGate(points)).toBeUndefined();
  });

  it("prefers the dominant full-course lap count over a repeated self-intersection", () => {
    const points = doubleCrossingCircuitPoints(3);

    const gate = inferStartFinishGate(points, { maximumCandidates: points.length });
    const completeLapCount = gate
      ? detectLaps(points, gate).laps.filter((lap) => lap.completion === "complete").length
      : 0;

    expect(gate).toBeDefined();
    expect(completeLapCount).toBe(2);
  });

  it("creates a directional gate perpendicular to the route", () => {
    const points = [gps(-0.0002, 0, 0), gps(0, 0, 1), gps(0.0002, 0, 2)];
    const gate = createGateFromRoutePoint(points, 1);
    expect(gate?.widthMeters).toBe(50);
    expect(gate?.forwardBearingDegrees).toBeCloseTo(90, 3);
    expect(gate?.line.coordinates[0][0]).toBeCloseTo(0, 5);
    expect(gate?.line.coordinates[1][0]).toBeCloseTo(0, 5);
  });

  it("interpolates forward crossings and ignores reverse crossings", () => {
    const gate = startGate();
    const points = [gps(-0.0001, 0, 0), gps(0.0001, 0, 1), gps(-0.0001, 0, 2)];
    const crossings = detectGateCrossings(points, gate, {
      minimumRearmDistanceMeters: 1,
      minimumRearmSeconds: 0,
    });
    expect(crossings).toHaveLength(1);
    expect(crossings[0].id).toBe("auto-start-finish-0.500");
    expect(crossings[0].elapsedSeconds).toBeCloseTo(0.5, 5);
  });

  it("flags a reverse crossing inside the finite start gate without creating a lap boundary", () => {
    const points = [gps(0.0001, 0, 0), gps(-0.0001, 0, 1)];
    const result = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 1,
      minimumRearmSeconds: 0,
    });

    expect(result.boundaries).toHaveLength(0);
    expect(result.laps).toHaveLength(1);
    expect(result.laps[0].flags).toContain("reverse-crossing");
    expect(result.warnings).toContain("One or more laps crossed the start/finish gate in the reverse direction.");
  });

  it("does not flag a reverse crossing outside the finite start gate", () => {
    const points = [gps(0.0001, 0.001, 0), gps(-0.0001, 0.001, 1)];
    const result = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 1,
      minimumRearmSeconds: 0,
    });

    expect(result.laps[0].flags).not.toContain("reverse-crossing");
  });

  it("keeps start/end fragments and complete laps", () => {
    const points = multiLapPoints(3);
    const result = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 20,
      minimumRearmSeconds: 1,
    });
    expect(result.boundaries).toHaveLength(3);
    expect(result.laps.map((lap) => lap.completion)).toEqual([
      "partial-start",
      "complete",
      "complete",
      "partial-end",
    ]);
    expect(result.laps.filter((lap) => lap.completion === "complete").every((lap) => lap.durationSeconds === 8)).toBe(true);
  });

  it("supports manual split, merge, and validity overrides", () => {
    const points = multiLapPoints(2);
    const auto = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 20,
      minimumRearmSeconds: 1,
    });
    const boundaryToRemove = auto.boundaries[1];
    const merged = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 20,
      minimumRearmSeconds: 1,
      boundaryOverrides: [{ id: "remove-1", type: "remove", boundaryId: boundaryToRemove.id }],
    });
    expect(merged.boundaries).toHaveLength(auto.boundaries.length - 1);

    const split = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 20,
      minimumRearmSeconds: 1,
      boundaryOverrides: [{ id: "split-1", type: "add", pointIndex: 6 }],
    });
    expect(split.boundaries.some((boundary) => boundary.source === "manual")).toBe(true);
    const target = split.laps.find((lap) => lap.completion === "complete");
    expect(target).toBeDefined();
    const excluded = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 20,
      minimumRearmSeconds: 1,
      boundaryOverrides: [{ id: "split-1", type: "add", pointIndex: 6 }],
      validityOverrides: [{ lapId: target!.id, validity: "excluded" }],
    });
    expect(excluded.laps.find((lap) => lap.id === target!.id)?.validity).toBe("excluded");
  });

  it("retains opening and closing session fragments shorter than one second", () => {
    const points = [gps(-0.00001, 0, 0), gps(0.0001, 0, 0.1), gps(0.0005, 0, 0.2)];
    const result = detectLaps(points, startGate(), {
      minimumRearmDistanceMeters: 1,
      minimumRearmSeconds: 0,
    });
    expect(result.laps.map((lap) => lap.completion)).toEqual(["partial-start", "partial-end"]);
    expect(result.laps.every((lap) => (lap.durationSeconds ?? 1) < 1)).toBe(true);
  });
});

function repeatedCircuitPoints(startIndex: number): GpsPoint[] {
  const circuit: Array<[number, number]> = [
    [-0.0005, 0], [0.0005, 0], [0.0008, 0.0004], [0, 0.0008], [-0.0008, 0.0004],
    [-0.0005, 0], [0.0005, 0], [0.0008, 0.0004], [0, 0.0008], [-0.0008, 0.0004],
    [-0.0005, 0], [0.0005, 0],
  ];
  return circuit.map(([longitude, latitude], offset) => gps(longitude, latitude, startIndex + offset));
}

function startGate(): TrackGate {
  return {
    id: "start-finish",
    name: "Start / Finish",
    kind: "start-finish",
    line: { type: "LineString", coordinates: [[0, -0.0002], [0, 0.0002]] },
    forwardBearingDegrees: 90,
    widthMeters: 50,
  };
}

function multiLapPoints(lapCount: number): GpsPoint[] {
  const coordinates: Array<[number, number]> = [[0.0001, 0]];
  const lap = [
    [0.0001, 0],
    [0.0005, 0],
    [0.0005, 0.001],
    [0, 0.001],
    [-0.0005, 0.001],
    [-0.0005, 0],
    [-0.0001, 0],
    [0.0001, 0],
  ] as Array<[number, number]>;
  for (let index = 0; index < lapCount; index += 1) {
    coordinates.push(...lap);
  }
  coordinates.push([0.0005, 0]);
  return coordinates.map(([longitude, latitude], index) => gps(longitude, latitude, index));
}

function doubleCrossingCircuitPoints(lapCount: number): GpsPoint[] {
  const coordinates: Array<[number, number]> = [[-0.0003, 0]];
  const lap = [
    [0.0003, 0], [0.001, 0], [0.001, 0.001], [-0.001, 0.001], [-0.001, 0], [-0.0003, 0],
    [0.0003, 0], [0.001, 0], [0.001, -0.001], [-0.001, -0.001], [-0.001, 0], [-0.0003, 0],
  ] as Array<[number, number]>;
  for (let index = 0; index < lapCount; index += 1) coordinates.push(...lap);
  coordinates.push([0.0003, 0]);
  return coordinates.map(([longitude, latitude], index) => gps(longitude, latitude, index));
}

function gps(longitude: number, latitude: number, seconds: number): GpsPoint {
  return {
    index: seconds,
    lineNumber: seconds + 1,
    rawLine: "",
    date: "01012026",
    time: "000000",
    latitude,
    longitude,
    altitudeMeters: 0,
    speedKmh: 60,
    bearingDegrees: 90,
    satelliteCount: 10,
    elapsedRealtimeNanos: seconds * 1_000_000_000,
    source: "RawGps",
    confidence: 1,
  };
}
