import { describe, expect, it } from "vitest";
import type { GpsPoint, LapResult, TrackGate, TrackProfileV1 } from "../types";
import {
  analyzeCorners,
  analyzeTimingSectorsDetailed,
  compareLapToReference,
  deriveTrackSectionGeometry,
  lapLineString,
  proposeTrackSections,
  resampleLapByDistance,
  theoreticalBestSeconds,
} from "../lapAnalysis";

describe("lap distance analysis", () => {
  it("resamples a lap on a regular distance axis", () => {
    const points = [gps(0, 0, 0, 0), gps(0.001, 0, 10, 100), gps(0.002, 0, 20, 50)];
    const samples = resampleLapByDistance(points, lap(0, 2, 0, 20), 50);
    expect(samples.length).toBeGreaterThan(4);
    expect(samples[1].distanceMeters).toBe(50);
    expect(samples.at(-1)?.speedKmh).toBe(50);
  });

  it("calculates positive delta when the selected lap is slower", () => {
    const points = [
      gps(0, 0, 0, 0),
      gps(0.001, 0, 10, 80),
      gps(0.002, 0, 20, 80),
      gps(0, 0, 30, 0),
      gps(0.001, 0, 35, 100),
      gps(0.002, 0, 40, 100),
    ];
    const slower = lap(0, 2, 0, 20);
    const faster = lap(3, 5, 30, 40);
    const comparison = compareLapToReference(points, slower, faster, 50);
    expect(comparison.at(-1)?.deltaSeconds).toBeCloseTo(10, 3);
  });

  it("proposes editable corner and straight sections from centerline curvature", () => {
    const sections = proposeTrackSections({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.001, 0],
        [0.0015, 0.0002],
        [0.0018, 0.0006],
        [0.002, 0.001],
        [0.002, 0.002],
        [0.002, 0.003],
      ],
    });
    expect(sections.some((section) => section.kind.startsWith("corner"))).toBe(true);
    expect(sections.every((section) => section.endDistanceMeters > section.startDistanceMeters)).toBe(true);
  });

  it("builds representative lap geometry on the five metre analysis axis", () => {
    const points = [gps(0, 0, 0, 100), gps(0.001, 0, 10, 100), gps(0.002, 0, 20, 100)];

    const line = lapLineString(points, lap(0, 2, 0, 20));

    expect(line?.type).toBe("LineString");
    expect(line?.coordinates.length).toBeGreaterThan(40);
    expect(line?.coordinates[0]).toEqual([0, 0]);
    expect(line?.coordinates.at(-1)).toEqual([0.002, 0]);
  });

  it("derives renderable section lines with interpolated distance boundaries", () => {
    const geometry = deriveTrackSectionGeometry(
      { type: "LineString", coordinates: [[0, 0], [0.001, 0], [0.002, 0]] },
      [{ id: "corner-1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 25, endDistanceMeters: 150 }],
    );

    expect(geometry).toHaveLength(1);
    expect(geometry[0]).toMatchObject({ id: "corner-1", name: "Corner 1", kind: "corner-right" });
    expect(geometry[0].line.coordinates).toHaveLength(3);
    expect(geometry[0].line.coordinates[0][0]).toBeCloseTo(0.000225, 5);
    expect(geometry[0].line.coordinates.at(-1)?.[0]).toBeCloseTo(0.001349, 5);
  });

  it("calculates entry, minimum, and exit speed for a corner section", () => {
    const points = [gps(0, 0, 0, 100), gps(0.001, 0, 5, 60), gps(0.002, 0, 10, 90)];
    const results = analyzeCorners(points, lap(0, 2, 0, 10), [
      { id: "c1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 0, endDistanceMeters: 250 },
    ]);
    expect(results[0]).toMatchObject({ entrySpeedKmh: 100, minimumSpeedKmh: 60, exitSpeedKmh: 90 });
    expect(results[0].maxDecelerationG).toBeGreaterThan(0.2);
  });

  it("derives available lateral acceleration from GPS speed and curvature", () => {
    const points = [gps(0, 0, 0, 60), gps(0.001, 0, 1, 60), gps(0.001, 0.001, 2, 60)];
    const results = analyzeCorners(points, lap(0, 2, 0, 2), [
      { id: "c1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 0, endDistanceMeters: 250 },
    ]);
    expect(results[0].maxLateralG).toBeGreaterThan(0.3);
  });

  it("does not report a zero-second theoretical best when no sectors exist", () => {
    expect(theoreticalBestSeconds([], 0)).toBeUndefined();
  });

  it("reports a lap whose sector gates are crossed in the wrong order", () => {
    const points = [
      gps(0, 0, 0, 80),
      gps(0, 0.001, 1, 80),
      gps(0.002, 0.001, 2, 80),
      gps(0, 0, 3, 80),
      gps(0.002, 0, 4, 80),
    ];
    const targetLap = lap(0, 4, 0, 4);
    const analysis = analyzeTimingSectorsDetailed(points, [targetLap], trackProfile(), false);

    expect(analysis.missedSectorLapIds).toEqual([targetLap.id]);
    expect(analysis.warnings).toContain("One or more laps crossed timing sector gates in the wrong order.");
  });
});

function trackProfile(): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id: "test-track",
    name: "Test track",
    centerline: { type: "LineString", coordinates: [[0, 0], [0.002, 0]] },
    direction: "clockwise",
    startFinish: gate("start-finish", "Start / Finish", 0, 0, "start-finish"),
    sectorGates: [
      gate("sector-1", "Sector 1", 0.001, 0, "sector"),
      gate("sector-2", "Sector 2", 0.001, 0.001, "sector"),
    ],
    sections: [],
    source: { kind: "user" },
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function gate(
  id: string,
  name: string,
  longitude: number,
  latitude: number,
  kind: TrackGate["kind"],
): TrackGate {
  return {
    id,
    name,
    kind,
    line: {
      type: "LineString",
      coordinates: [[longitude, latitude - 0.0002], [longitude, latitude + 0.0002]],
    },
    forwardBearingDegrees: 90,
    widthMeters: 50,
  };
}

function lap(startIndex: number, endIndex: number, startSeconds: number, endSeconds: number): LapResult {
  return {
    id: `${startIndex}-${endIndex}`,
    ordinal: 1,
    completion: "complete",
    validity: "valid",
    flags: [],
    start: {
      id: `start-${startIndex}`,
      source: "auto",
      pointIndex: startIndex,
      elapsedSeconds: startSeconds,
      coordinate: [0, 0],
    },
    end: {
      id: `end-${endIndex}`,
      source: "auto",
      pointIndex: endIndex,
      elapsedSeconds: endSeconds,
      coordinate: [0, 0],
    },
    startIndex,
    endIndex,
    durationSeconds: endSeconds - startSeconds,
    distanceKm: 0.2,
    averageSpeedKmh: 50,
    maxSpeedKmh: 100,
  };
}

function gps(longitude: number, latitude: number, seconds: number, speedKmh: number): GpsPoint {
  return {
    index: seconds,
    lineNumber: seconds + 1,
    rawLine: "",
    date: "01012026",
    time: "000000",
    latitude,
    longitude,
    altitudeMeters: 0,
    speedKmh,
    bearingDegrees: 90,
    satelliteCount: 10,
    elapsedRealtimeNanos: seconds * 1_000_000_000,
    source: "RawGps",
    confidence: 1,
  };
}
