import { describe, expect, it } from "vitest";
import type { GpsPoint, LapResult } from "../types";
import { analyzeCorners, compareLapToReference, proposeTrackSections, resampleLapByDistance } from "../lapAnalysis";

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

  it("calculates entry, minimum, and exit speed for a corner section", () => {
    const points = [gps(0, 0, 0, 100), gps(0.001, 0, 5, 60), gps(0.002, 0, 10, 90)];
    const results = analyzeCorners(points, lap(0, 2, 0, 10), [
      { id: "c1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 0, endDistanceMeters: 250 },
    ]);
    expect(results[0]).toMatchObject({ entrySpeedKmh: 100, minimumSpeedKmh: 60, exitSpeedKmh: 90 });
  });
});

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
