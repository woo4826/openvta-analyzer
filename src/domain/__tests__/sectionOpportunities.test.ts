import { describe, expect, it } from "vitest";
import { buildSectionOpportunities } from "../sectionOpportunities";
import type { GpsPoint, LapResult, TrackSection } from "../types";

const analysisLine = { type: "LineString" as const, coordinates: [[0, 0], [0.001, 0]] };
const sections: TrackSection[] = [
  { id: "entry", name: "Entry", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 45 },
  { id: "exit", name: "Exit", kind: "corner-right", startDistanceMeters: 45, endDistanceMeters: 100 },
];

describe("section opportunities", () => {
  it("compares a focused lap with its eligible reference and measures consistency", () => {
    const fixture = fixtureData();
    const opportunities = buildSectionOpportunities(
      fixture.points,
      fixture.laps,
      analysisLine,
      sections,
      "focus",
      "reference",
      false,
    );

    expect(opportunities).toHaveLength(2);
    expect(opportunities[0]).toMatchObject({
      focusedLapId: "focus",
      referenceLapId: "reference",
      eligibleSampleCount: 3,
    });
    expect(opportunities[0].timeDeltaSeconds).toBeGreaterThan(0);
    expect(opportunities[0].consistencyStdDevSeconds).toBeGreaterThan(0);
  });

  it("does not rank a recording fragment that fails to cover a section", () => {
    const fixture = fixtureData();
    const focus = fixture.laps.find((lap) => lap.id === "focus")!;
    focus.endIndex = focus.startIndex + 1;
    focus.end.pointIndex = focus.endIndex;
    focus.end.source = "session-end";
    focus.end.coordinate = [0.0005, 0];
    focus.completion = "partial-end";

    const opportunities = buildSectionOpportunities(
      fixture.points,
      fixture.laps,
      analysisLine,
      sections,
      "focus",
      "reference",
      false,
    );

    expect(opportunities.map((opportunity) => opportunity.section.id)).not.toContain("exit");
  });
});

function fixtureData(): { points: GpsPoint[]; laps: LapResult[] } {
  const definitions = [
    { id: "reference", times: [0, 2, 4], speeds: [80, 60, 90] },
    { id: "focus", times: [10, 13, 16], speeds: [78, 55, 82] },
    { id: "other", times: [20, 22.5, 25], speeds: [79, 58, 86] },
  ];
  const points: GpsPoint[] = [];
  const laps: LapResult[] = [];
  definitions.forEach((definition, ordinal) => {
    const startIndex = points.length;
    [0, 0.0005, 0.001].forEach((longitude, index) => points.push(gps(
      points.length,
      longitude,
      definition.times[index],
      definition.speeds[index],
    )));
    const endIndex = points.length - 1;
    laps.push({
      id: definition.id,
      ordinal: ordinal + 1,
      completion: "complete",
      validity: "valid",
      flags: [],
      start: { id: `${definition.id}-start`, source: "auto", pointIndex: startIndex, elapsedSeconds: definition.times[0], coordinate: [0, 0] },
      end: { id: `${definition.id}-end`, source: "auto", pointIndex: endIndex, elapsedSeconds: definition.times[2], coordinate: [0.001, 0] },
      startIndex,
      endIndex,
      durationSeconds: definition.times[2] - definition.times[0],
      distanceKm: 0.111,
      averageSpeedKmh: 70,
      maxSpeedKmh: 90,
    });
  });
  return { points, laps };
}

function gps(index: number, longitude: number, seconds: number, speedKmh: number): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "20260715",
    time: "000000",
    latitude: 0,
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
