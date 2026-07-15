import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GpsPoint, LapResult, TrackSection } from "../../domain/types";
import { useSegmentWorkbench } from "../useSegmentWorkbench";

describe("useSegmentWorkbench", () => {
  it("owns one scope across filters, sections, and chart ranges", () => {
    const fixture = workbenchFixture();
    const { result } = renderHook(() => useSegmentWorkbench(fixture));

    expect(result.current.scope).toEqual({ kind: "whole-lap" });
    act(() => result.current.selectSection("c1"));
    expect(result.current.scope).toEqual({ kind: "section", sectionId: "c1" });
    act(() => result.current.setFilter("straights"));
    expect(result.current.navigationSections.every((section) => section.kind === "straight")).toBe(true);
    expect(result.current.scope).toEqual({ kind: "whole-lap" });
    act(() => result.current.selectRange(80, 20, "chart"));
    expect(result.current.scope).toEqual({ kind: "range", startDistanceMeters: 20, endDistanceMeters: 80, source: "chart" });
    act(() => result.current.resetScope());
    expect(result.current.scope).toEqual({ kind: "whole-lap" });
  });

  it("keeps focused and reference laps in a five-lap overlay and normalizes invalid references", () => {
    const fixture = workbenchFixture(7);
    const { result } = renderHook(() => useSegmentWorkbench(fixture));

    expect(result.current.referenceLapId).toBe(result.current.analysis.fastestLapId);
    const sessionReferenceLapId = result.current.referenceLapId;
    expect(result.current.focusedLapId).toBe("lap-7");
    act(() => result.current.selectSection("c1"));
    expect(result.current.referenceLapId).toBe(sessionReferenceLapId);
    act(() => result.current.setFocusedLap("lap-5"));
    expect(result.current.focusedLapId).toBe("lap-5");
    expect(result.current.overlayLapIds).toContain("lap-5");
    expect(result.current.overlayLapIds).toContain(result.current.referenceLapId);
    expect(result.current.overlayLapIds).toHaveLength(5);

    act(() => result.current.setReferenceLap("missing"));
    expect(result.current.referenceLapId).toBe(result.current.analysis.fastestLapId);
  });

  it("adapts the spatial scope to the legacy source-index selection without conflating the two models", () => {
    const fixture = workbenchFixture();
    const { result } = renderHook(() => useSegmentWorkbench(fixture));
    act(() => result.current.selectSection("c1"));

    expect(result.current.activeSegment).toEqual(expect.objectContaining({
      startIndex: expect.any(Number),
      endIndex: expect.any(Number),
      source: "map",
    }));
  });
});

function workbenchFixture(lapCount = 2) {
  const points: GpsPoint[] = [];
  const laps: LapResult[] = [];
  for (let lapIndex = 0; lapIndex < lapCount; lapIndex += 1) {
    const startIndex = points.length;
    const start = lapIndex * 20;
    [0, 0.0005, 0.001].forEach((longitude, offset) => points.push(gps(points.length, longitude, start + offset * (4 + lapIndex))));
    const endIndex = points.length - 1;
    laps.push({
      id: `lap-${lapIndex + 1}`,
      ordinal: lapIndex + 1,
      completion: "complete",
      validity: lapIndex === 5 ? "invalid" : "valid",
      flags: lapIndex === 5 ? ["gps-gap"] : [],
      start: { id: `s-${lapIndex}`, source: "auto", pointIndex: startIndex, elapsedSeconds: start, coordinate: [0, 0] },
      end: { id: `e-${lapIndex}`, source: "auto", pointIndex: endIndex, elapsedSeconds: start + 8 + lapIndex * 2, coordinate: [0.001, 0] },
      startIndex,
      endIndex,
      durationSeconds: 8 + lapIndex * 2,
      distanceKm: 0.111,
      averageSpeedKmh: 80,
      maxSpeedKmh: 90,
    });
  }
  const sections: TrackSection[] = [
    { id: "c1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 10, endDistanceMeters: 60 },
    { id: "s1", name: "Straight 1", kind: "straight", startDistanceMeters: 60, endDistanceMeters: 100 },
  ];
  return {
    points,
    laps,
    analysisLine: { type: "LineString" as const, coordinates: [[0, 0], [0.001, 0]] },
    sections,
    includePartialLapSections: false,
  };
}

function gps(index: number, longitude: number, seconds: number): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "20260715",
    time: "000000",
    latitude: 0,
    longitude,
    altitudeMeters: 0,
    speedKmh: 80,
    bearingDegrees: 90,
    satelliteCount: 10,
    accuracyMeters: 2,
    elapsedRealtimeNanos: seconds * 1_000_000_000,
    source: "RawGps",
    confidence: 1,
  };
}
