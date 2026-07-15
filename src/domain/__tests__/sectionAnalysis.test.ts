import { describe, expect, it } from "vitest";
import {
  analyzeLapSections,
  automaticTheoreticalBestSeconds,
  scopedLapComparison,
} from "../sectionAnalysis";
import type { GpsPoint, LapResult, TrackSection } from "../types";

describe("automatic section lap analysis", () => {
  it("projects complete laps to the same sections despite driven-distance variation", () => {
    const { points, laps } = twoCompleteLaps();
    const results = analyzeLapSections(points, laps, analysisLine(), sections(), false);

    expect(results.filter((result) => result.sectionId === "corner-1")).toHaveLength(2);
    expect(results).toHaveLength(sections().length * 2);
    expect(results.every((result) => result.entrySpeedKmh > 0 && result.durationSeconds > 0)).toBe(true);
    expect(results.every((result) => !result.fromPartialLap && result.eligibleForBest)).toBe(true);
  });

  it("includes only fully traversed partial sections and honours best eligibility", () => {
    const points = [
      gps(0, 0, 0, 100),
      gps(0.0005, 0, 3, 90),
      gps(0.001, 0, 6, 70),
      gps(0.0015, 0, 9, 85),
      gps(0.0021, 0, 12, 95),
    ];
    const lap = makeLap("partial-end", 0, 4, 0, 12, [0, 0], [0.0021, 0]);

    const off = analyzeLapSections(points, [lap], analysisLine(), sections(), false);
    const on = analyzeLapSections(points, [lap], analysisLine(), sections(), true);

    expect(off.map((result) => result.sectionId)).toEqual(["straight-1", "corner-1"]);
    expect(off.every((result) => result.fromPartialLap && !result.eligibleForBest)).toBe(true);
    expect(on.every((result) => result.eligibleForBest)).toBe(true);
  });

  it("rejects a lap with neither timing boundary", () => {
    const points = [gps(0.0005, 0, 0, 80), gps(0.0015, 0, 5, 80)];
    const lap = makeLap("partial-both", 0, 1, 0, 5, [0.0005, 0], [0.0015, 0]);

    expect(analyzeLapSections(points, [lap], analysisLine(), sections(), true)).toEqual([]);
  });

  it("rebases scoped delta time and distance to zero at the section start", () => {
    const { points, laps } = twoCompleteLaps();
    const rows = scopedLapComparison(points, laps[0], laps[1], analysisLine(), sections()[1], 20);

    expect(rows[0].distanceMeters).toBeCloseTo(0);
    expect(rows[0].deltaSeconds).toBeCloseTo(0);
    expect(rows.at(-1)?.deltaSeconds).toBeGreaterThan(0);
  });

  it("adds the best eligible time for every automatic section", () => {
    const { points, laps } = twoCompleteLaps();
    const results = analyzeLapSections(points, laps, analysisLine(), sections(), false);
    const expected = sections().reduce((sum, section) => {
      const best = Math.min(...results
        .filter((result) => result.sectionId === section.id)
        .map((result) => result.durationSeconds));
      return sum + best;
    }, 0);

    expect(automaticTheoreticalBestSeconds(results, sections().length)).toBeCloseTo(expected);
  });
});

function analysisLine() {
  return { type: "LineString" as const, coordinates: [[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]] };
}

function sections(): TrackSection[] {
  return [
    { id: "straight-1", name: "Straight 1", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 100 },
    { id: "corner-1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 100, endDistanceMeters: 220 },
    { id: "straight-2", name: "Straight 2", kind: "straight", startDistanceMeters: 220, endDistanceMeters: 333.5 },
  ];
}

function twoCompleteLaps(): { points: GpsPoint[]; laps: LapResult[] } {
  const firstCoordinates = [0, 0.0004, 0.0009, 0.0014, 0.002, 0.0025, 0.003];
  const secondCoordinates = [0, 0.0006, 0.0012, 0.0018, 0.0024, 0.003];
  const first = firstCoordinates.map((longitude, index) => gps(longitude, 0, index * 4, 80 - Math.abs(3 - index) * 3));
  const second = secondCoordinates.map((longitude, index) => gps(longitude, 0.00002, 30 + index * 2, 105 - Math.abs(2.5 - index) * 3));
  const points = [...first, ...second].map((point, index) => ({ ...point, index, lineNumber: index + 1 }));
  return {
    points,
    laps: [
      makeLap("complete", 0, first.length - 1, 0, 24, [0, 0], [0.003, 0]),
      makeLap("complete", first.length, points.length - 1, 30, 40, [0, 0], [0.003, 0]),
    ],
  };
}

function makeLap(
  completion: LapResult["completion"],
  startIndex: number,
  endIndex: number,
  startSeconds: number,
  endSeconds: number,
  startCoordinate: [number, number],
  endCoordinate: [number, number],
): LapResult {
  return {
    id: `${completion}-${startIndex}`,
    ordinal: startIndex + 1,
    completion,
    validity: "valid",
    flags: [],
    start: {
      id: `start-${startIndex}`,
      source: completion === "partial-start" || completion === "partial-both" ? "session-start" : "auto",
      pointIndex: startIndex,
      elapsedSeconds: startSeconds,
      coordinate: startCoordinate,
    },
    end: {
      id: `end-${endIndex}`,
      source: completion === "partial-end" || completion === "partial-both" ? "session-end" : "auto",
      pointIndex: endIndex,
      elapsedSeconds: endSeconds,
      coordinate: endCoordinate,
    },
    startIndex,
    endIndex,
    durationSeconds: completion === "complete" ? endSeconds - startSeconds : undefined,
    distanceKm: 0.333,
    averageSpeedKmh: 90,
    maxSpeedKmh: 110,
  };
}

function gps(longitude: number, latitude: number, seconds: number, speedKmh: number): GpsPoint {
  return {
    index: 0,
    lineNumber: 1,
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
