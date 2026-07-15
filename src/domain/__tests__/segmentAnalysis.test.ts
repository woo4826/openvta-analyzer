import { describe, expect, it } from "vitest";
import {
  analysisScopeRange,
  analyzeSegmentScope,
  scopeSourceIndexes,
} from "../segmentAnalysis";
import type { AnalysisScope, GpsPoint, LapResult, TrackSection } from "../types";

const line = { type: "LineString" as const, coordinates: [[0, 0], [0.001, 0]] };
const sections: TrackSection[] = [{
  id: "c1",
  name: "Corner 1",
  kind: "corner-right",
  startDistanceMeters: 20,
  endDistanceMeters: 90,
}];

describe("segment analysis", () => {
  it("resolves whole-lap, section, and ordered custom ranges", () => {
    expect(analysisScopeRange({ kind: "section", sectionId: "c1" }, sections, 111.2))
      .toEqual({ startDistanceMeters: 20, endDistanceMeters: 90 });
    expect(analysisScopeRange({ kind: "range", startDistanceMeters: 95, endDistanceMeters: 10, source: "chart" }, sections, 111.2))
      .toEqual({ startDistanceMeters: 10, endDistanceMeters: 95 });
    expect(analysisScopeRange({ kind: "whole-lap" }, sections, 111.2))
      .toEqual({ startDistanceMeters: 0, endDistanceMeters: 111.2 });
  });

  it("interpolates scope boundaries, includes fully covered partial laps, and retains uncovered rows", () => {
    const fixture = lapsFixture();
    const result = analyzeSegmentScope(
      fixture.points,
      fixture.laps,
      line,
      sections,
      { kind: "section", sectionId: "c1" },
      "tight-slow",
      true,
    );

    const wide = result.records.find((record) => record.lapId === "wide-fast")!;
    const partial = result.records.find((record) => record.lapId === "partial-covered")!;
    const uncovered = result.records.find((record) => record.lapId === "partial-uncovered")!;
    expect(wide.trajectory[0].distanceMeters).toBe(0);
    expect(wide.trajectory.at(-1)?.distanceMeters).toBe(70);
    expect(wide.trajectory[0].elapsedSeconds).toBe(0);
    expect(partial.coverage).toBe("complete");
    expect(partial.fromPartialLap).toBe(true);
    expect(partial.eligibleForBest).toBe(true);
    expect(uncovered.coverage).toBe("none");
    expect(uncovered.trajectory).toEqual([]);
  });

  it("keeps fastest and shortest path independent and computes progress-aligned metrics", () => {
    const fixture = lapsFixture();
    const result = analyzeSegmentScope(
      fixture.points,
      fixture.laps,
      line,
      sections,
      { kind: "whole-lap" },
      "tight-slow",
      false,
    );

    expect(result.fastestLapId).toBe("wide-fast");
    expect(result.shortestLapId).toBe("tight-slow");
    const wide = result.records.find((record) => record.lapId === "wide-fast")!;
    expect(wide.drivenDistanceMeters).toBeGreaterThan(result.records.find((record) => record.lapId === "tight-slow")!.drivenDistanceMeters!);
    expect(wide.deltaShortestMeters).toBeGreaterThan(0);
    expect(wide.trajectory.some((sample) => Math.abs(sample.signedOffsetMeters) > 1)).toBe(true);
    expect(wide.trajectory[0].deltaSeconds).toBeCloseTo(0);
    expect(wide.gpsConfidence).toBe("high");
    expect(scopeSourceIndexes(wide)).toEqual(expect.objectContaining({ startIndex: expect.any(Number), endIndex: expect.any(Number) }));
  });

  it("masks loss-rate evidence at very low speed and applies partial-best policy only to complete scope coverage", () => {
    const fixture = lapsFixture();
    const off = analyzeSegmentScope(fixture.points, fixture.laps, line, sections, sectionScope(), "tight-slow", false);
    const on = analyzeSegmentScope(fixture.points, fixture.laps, line, sections, sectionScope(), "tight-slow", true);

    expect(off.records.find((record) => record.lapId === "partial-covered")?.eligibleForBest).toBe(false);
    expect(on.records.find((record) => record.lapId === "partial-covered")?.eligibleForBest).toBe(true);
    const lowSpeed = on.records.find((record) => record.lapId === "low-speed")!;
    expect(lowSpeed.peakLossRateSecondsPer100m).toBeUndefined();
    expect(lowSpeed.trajectory.every((sample) => sample.lossRateSecondsPer100m === undefined)).toBe(true);
    expect(on.records.find((record) => record.lapId === "partial-uncovered")?.eligibleForBest).toBe(false);
  });
});

function sectionScope(): AnalysisScope {
  return { kind: "section", sectionId: "c1" };
}

function lapsFixture(): { points: GpsPoint[]; laps: LapResult[] } {
  const definitions = [
    { id: "wide-fast", completion: "complete" as const, coordinates: [[0, 0], [0.0005, 0.0002], [0.001, 0]], times: [0, 4, 8], speed: 90 },
    { id: "tight-slow", completion: "complete" as const, coordinates: [[0, 0], [0.0005, 0], [0.001, 0]], times: [20, 26, 32], speed: 70 },
    { id: "partial-covered", completion: "partial-end" as const, coordinates: [[0, 0], [0.0005, 0.00001], [0.00095, 0]], times: [40, 46, 51], speed: 65 },
    { id: "partial-uncovered", completion: "partial-end" as const, coordinates: [[0, 0], [0.0003, 0], [0.00055, 0]], times: [60, 64, 67], speed: 55 },
    { id: "low-speed", completion: "complete" as const, coordinates: [[0, 0], [0.0005, -0.00001], [0.001, 0]], times: [80, 100, 120], speed: 8 },
  ];
  const points: GpsPoint[] = [];
  const laps: LapResult[] = [];
  definitions.forEach((definition, ordinal) => {
    const startIndex = points.length;
    definition.coordinates.forEach(([longitude, latitude], offset) => {
      points.push(gps(points.length, longitude, latitude, definition.times[offset], definition.speed));
    });
    const endIndex = points.length - 1;
    laps.push({
      id: definition.id,
      ordinal: ordinal + 1,
      completion: definition.completion,
      validity: "valid",
      flags: [],
      start: {
        id: `${definition.id}-start`,
        source: "auto",
        pointIndex: startIndex,
        elapsedSeconds: definition.times[0],
        coordinate: definition.coordinates[0],
      },
      end: {
        id: `${definition.id}-end`,
        source: definition.completion === "complete" ? "auto" : "session-end",
        pointIndex: endIndex,
        elapsedSeconds: definition.times.at(-1)!,
        coordinate: definition.coordinates.at(-1)!,
      },
      startIndex,
      endIndex,
      durationSeconds: definition.completion === "complete" ? definition.times.at(-1)! - definition.times[0] : undefined,
      distanceKm: 0.12,
      averageSpeedKmh: definition.speed,
      maxSpeedKmh: definition.speed,
    });
  });
  return { points, laps };
}

function gps(index: number, longitude: number, latitude: number, seconds: number, speedKmh: number): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "20260715",
    time: "000000",
    latitude,
    longitude,
    altitudeMeters: 0,
    speedKmh,
    bearingDegrees: 90,
    satelliteCount: 12,
    accuracyMeters: 2,
    elapsedRealtimeNanos: seconds * 1_000_000_000,
    source: "RawGps",
    confidence: 1,
  };
}
