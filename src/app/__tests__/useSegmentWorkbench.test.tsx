import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GpsPoint, LapResult, SegmentLapVisibility, TrackSection } from "../../domain/types";
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

  it("reveals a map-selected section when the active type filter would hide it", () => {
    const fixture = workbenchFixture();
    const { result } = renderHook(() => useSegmentWorkbench(fixture));

    act(() => result.current.setFilter("corners"));
    expect(result.current.filter).toBe("corners");
    act(() => result.current.selectSection("s1"));

    expect(result.current.scope).toEqual({ kind: "section", sectionId: "s1" });
    expect(result.current.filter).toBe("all");
    expect(result.current.navigationSections.map((section) => section.id)).toContain("s1");
  });

  it("defaults to distinct focused and reference laps and falls back from an invalid reference", () => {
    const fixture = workbenchFixture(7);
    const { result } = renderHook(() => useSegmentWorkbench(fixture));

    expect(result.current.referenceLapId).toBe(result.current.analysis.fastestLapId);
    const sessionReferenceLapId = result.current.referenceLapId;
    expect(result.current.focusedLapId).toBe("lap-7");
    expect(result.current.focusedLapId).not.toBe(result.current.referenceLapId);
    act(() => result.current.selectSection("c1"));
    expect(result.current.referenceLapId).toBe(sessionReferenceLapId);
    act(() => result.current.setFocusedLap("lap-5"));
    expect(result.current.focusedLapId).toBe("lap-5");

    act(() => result.current.setReferenceLap("lap-3"));
    expect(result.current.referenceLapId).toBe("lap-3");
    act(() => result.current.setReferenceLap("missing"));
    expect(result.current.referenceLapId).toBe(result.current.analysis.fastestLapId);
    expect(result.current).not.toHaveProperty("overlayLapIds");
    expect(result.current).not.toHaveProperty("toggleOverlayLap");
  });

  it("swaps roles when either role selects the other role's lap", () => {
    const fixture = workbenchFixture(4);
    const { result } = renderHook(() => useSegmentWorkbench(fixture));
    const initialFocus = result.current.focusedLapId!;
    const initialReference = result.current.referenceLapId!;

    act(() => result.current.setFocusedLap(initialReference));
    expect(result.current.focusedLapId).toBe(initialReference);
    expect(result.current.referenceLapId).toBe(initialFocus);

    act(() => result.current.setReferenceLap(initialReference));
    expect(result.current.focusedLapId).toBe(initialFocus);
    expect(result.current.referenceLapId).toBe(initialReference);
  });

  it("chooses a deterministic eligible reference when the prior focus cannot become reference", () => {
    const fixture = workbenchFixture(7);
    const { result } = renderHook(() => useSegmentWorkbench(fixture));

    act(() => result.current.setFocusedLap("lap-6"));
    expect(result.current.focusedLapId).toBe("lap-6");
    const priorReference = result.current.referenceLapId!;

    act(() => result.current.setFocusedLap(priorReference));
    expect(result.current.focusedLapId).toBe(priorReference);
    expect(result.current.referenceLapId).toBe("lap-2");
    expect(result.current.referenceLapId).not.toBe(result.current.focusedLapId);
  });

  it("keeps derived roles distinct when multiple records exist and allows one record to fill both roles", () => {
    const multiple = renderHook(() => useSegmentWorkbench(workbenchFixture(3)));
    expect(multiple.result.current.focusedLapId).not.toBe(multiple.result.current.referenceLapId);

    const singleFixture = workbenchFixture(1);
    const multiFixture = workbenchFixture(2);
    const single = renderHook(
      ({ fixture }) => useSegmentWorkbench(fixture),
      { initialProps: { fixture: singleFixture } },
    );
    expect(single.result.current.focusedLapId).toBe("lap-1");
    expect(single.result.current.referenceLapId).toBe("lap-1");

    act(() => single.result.current.setFocusedLap("lap-1"));
    single.rerender({ fixture: multiFixture });
    expect(single.result.current.analysis.records).toHaveLength(2);
    expect(single.result.current.focusedLapId).toBe("lap-2");
    expect(single.result.current.referenceLapId).toBe("lap-1");
  });

  it("collapses roles to the only lap with trajectory data in the selected scope", () => {
    const fixture = workbenchFixtureWithUncoveredPartial();
    const { result } = renderHook(() => useSegmentWorkbench(fixture));

    expect(result.current.analysis.records).toHaveLength(2);
    expect(result.current.focusedLapId).toBe("partial-lap");
    expect(result.current.referenceLapId).toBe("lap-1");

    act(() => result.current.selectSection("s1"));

    expect(result.current.analysis.records.find((record) => record.lapId === "partial-lap")?.trajectory).toHaveLength(0);
    expect(result.current.focusedLapId).toBe("lap-1");
    expect(result.current.referenceLapId).toBe("lap-1");
    act(() => result.current.setFocusedLap("partial-lap"));
    expect(result.current.focusedLapId).toBe("lap-1");
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

  it("isolates presentation laps without changing the comparison reference", () => {
    const fixture = workbenchFixture(4);
    const { result, rerender } = renderHook(
      ({ lapVisibility }) => useSegmentWorkbench({ ...fixture, lapVisibility }),
      { initialProps: { lapVisibility: "focus-reference" as SegmentLapVisibility } },
    );
    const referenceLapId = result.current.referenceLapId;
    const focusedLapId = result.current.focusedLapId;

    expect(result.current.visibleLapIds).toEqual([focusedLapId, referenceLapId]);
    rerender({ lapVisibility: "focus-only" });
    expect(result.current.visibleLapIds).toEqual([focusedLapId]);
    expect(result.current.referenceLapId).toBe(referenceLapId);
    rerender({ lapVisibility: "all" });
    expect(result.current.visibleLapIds).toHaveLength(4);
    expect(result.current.visibleLapIds).toEqual(result.current.analysis.records.map((record) => record.lapId));
    expect(result.current.focusedLapId).not.toBe(result.current.referenceLapId);
  });

  it("resets a selected section synchronously when that section is removed", async () => {
    const fixture = workbenchFixture();
    const { result, rerender } = renderHook(
      ({ sections }) => useSegmentWorkbench({ ...fixture, sections }),
      { initialProps: { sections: fixture.sections } },
    );
    act(() => result.current.selectSection("c1"));
    expect(result.current.scope).toEqual({ kind: "section", sectionId: "c1" });

    rerender({ sections: fixture.sections.filter((section) => section.id !== "c1") });

    expect(result.current.scope).toEqual({ kind: "whole-lap" });
    expect(result.current.analysis.scope).toEqual({ kind: "whole-lap" });
    await waitFor(() => expect(result.current.scope).toEqual({ kind: "whole-lap" }));
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

function workbenchFixtureWithUncoveredPartial() {
  const fixture = workbenchFixture(1);
  const startIndex = fixture.points.length;
  fixture.points.push(
    gps(startIndex, 0, 20),
    gps(startIndex + 1, 0.0002, 22),
  );
  fixture.laps.push({
    id: "partial-lap",
    ordinal: 2,
    completion: "partial-end",
    validity: "valid",
    flags: ["in-lap"],
    start: { id: "partial-start", source: "auto", pointIndex: startIndex, elapsedSeconds: 20, coordinate: [0, 0] },
    end: { id: "partial-end", source: "session-end", pointIndex: startIndex + 1, elapsedSeconds: 22, coordinate: [0.0002, 0] },
    startIndex,
    endIndex: startIndex + 1,
    durationSeconds: 2,
    distanceKm: 0.022,
    averageSpeedKmh: 40,
    maxSpeedKmh: 40,
  });
  return fixture;
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
