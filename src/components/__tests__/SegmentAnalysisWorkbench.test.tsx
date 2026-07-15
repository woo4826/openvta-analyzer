import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GpsPoint, LapResult, TrackProfileV1 } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";

vi.mock("../SegmentTrajectoryMap", () => ({
  SegmentTrajectoryMap: ({ focusedLapId, referenceLapId, onSegmentChange }: { focusedLapId?: string; referenceLapId?: string; onSegmentChange: (segment: { startIndex: number; endIndex: number; source: "map" }) => void }) => (
    <div data-testid="map-state">{focusedLapId}:{referenceLapId}<button type="button" onClick={() => onSegmentChange({ startIndex: 0, endIndex: 1, source: "map" })}>Select map range</button></div>
  ),
}));
vi.mock("../SegmentTelemetryChart", () => ({
  SegmentTelemetryChart: ({ focusedLapId, referenceLapId, onRange }: { focusedLapId?: string; referenceLapId?: string; onRange: (start: number, end: number) => void }) => (
    <div data-testid="chart-state">{focusedLapId}:{referenceLapId}<button type="button" onClick={() => onRange(20, 60)}>Select graph range</button></div>
  ),
}));
vi.mock("../SegmentVariationChart", () => ({
  SegmentVariationChart: ({ focusedLapId, referenceLapId }: { focusedLapId?: string; referenceLapId?: string }) => (
    <div data-testid="variation-state">{focusedLapId}:{referenceLapId}</div>
  ),
}));

import { SegmentAnalysisWorkbench } from "../SegmentAnalysisWorkbench";

describe("SegmentAnalysisWorkbench", () => {
  it("releases map and chart resources while the preserved workbench is inactive", () => {
    const fixture = data();
    render(<I18nProvider><SegmentAnalysisWorkbench
      active={false}
      sourceName="session.Vta"
      points={fixture.points}
      laps={fixture.laps}
      profile={fixture.profile}
      analysisLine={fixture.profile.centerline}
      includePartialLapSections={false}
      onIncludePartialLapSections={vi.fn()}
      mapSettings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
      selectedPointIndex={0}
      onSelectedPointIndex={vi.fn()}
      onMapSettingsChange={vi.fn()}
      onActiveSegment={vi.fn()}
      onSaveRange={vi.fn()}
      onOpenSetup={vi.fn()}
    /></I18nProvider>);

    expect(screen.queryByTestId("map-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart-state")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Analysis scope" })).toBeInTheDocument();
  });

  it("synchronizes scope and focused lap across ribbon, map, graph, and lap table", async () => {
    const user = userEvent.setup();
    const fixture = data();
    render(<I18nProvider><SegmentAnalysisWorkbench
      sourceName="session.Vta"
      points={fixture.points}
      laps={fixture.laps}
      profile={fixture.profile}
      analysisLine={fixture.profile.centerline}
      includePartialLapSections={false}
      onIncludePartialLapSections={vi.fn()}
      mapSettings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
      selectedPointIndex={0}
      onSelectedPointIndex={vi.fn()}
      onMapSettingsChange={vi.fn()}
      onActiveSegment={vi.fn()}
      onSaveRange={vi.fn()}
      onOpenSetup={vi.fn()}
    /></I18nProvider>);

    await user.click(within(screen.getByRole("navigation", { name: "Analysis scope" })).getByRole("button", { name: /Corner 1/ }));
    expect(screen.getByText(/Corner 1 · 10–90 m/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Focus Lap 2/ }));
    expect(screen.getByTestId("map-state")).toHaveTextContent("lap-2");
    expect(screen.getByTestId("chart-state")).toHaveTextContent("lap-2");
    expect(screen.getByText("Where am I losing time?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Select map range" }));
    expect(screen.getByText(/Custom range · 0–56 m/)).toBeVisible();
  });

  it("saves a graph-selected range as a named track section", async () => {
    const user = userEvent.setup();
    const fixture = data();
    const onSaveRange = vi.fn();
    render(<I18nProvider><SegmentAnalysisWorkbench
      sourceName="session.Vta"
      points={fixture.points}
      laps={fixture.laps}
      profile={fixture.profile}
      analysisLine={fixture.profile.centerline}
      includePartialLapSections={false}
      onIncludePartialLapSections={vi.fn()}
      mapSettings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
      selectedPointIndex={0}
      onSelectedPointIndex={vi.fn()}
      onMapSettingsChange={vi.fn()}
      onActiveSegment={vi.fn()}
      onSaveRange={onSaveRange}
      onOpenSetup={vi.fn()}
    /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Select graph range" }));
    await user.click(screen.getByRole("button", { name: "Save range as segment" }));
    await user.type(screen.getByRole("textbox", { name: "Segment name" }), "Late apex");
    await user.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "corner-left");
    await user.click(screen.getByRole("button", { name: "Save segment" }));

    expect(onSaveRange).toHaveBeenCalledWith(20, 60, "Late apex", "corner-left");
  });
});

function data(): { points: GpsPoint[]; laps: LapResult[]; profile: TrackProfileV1 } {
  const points: GpsPoint[] = [];
  const laps: LapResult[] = [];
  for (let lapIndex = 0; lapIndex < 2; lapIndex += 1) {
    const startIndex = points.length;
    [0, 0.0005, 0.001].forEach((longitude, offset) => points.push(gps(points.length, longitude, lapIndex * 20 + offset * (5 + lapIndex))));
    const endIndex = points.length - 1;
    laps.push({
      id: `lap-${lapIndex + 1}`,
      ordinal: lapIndex + 1,
      completion: "complete",
      validity: "valid",
      flags: [],
      start: { id: `s${lapIndex}`, source: "auto", pointIndex: startIndex, elapsedSeconds: lapIndex * 20, coordinate: [0, 0] },
      end: { id: `e${lapIndex}`, source: "auto", pointIndex: endIndex, elapsedSeconds: lapIndex * 20 + (10 + lapIndex * 2), coordinate: [0.001, 0] },
      startIndex,
      endIndex,
      durationSeconds: 10 + lapIndex * 2,
      distanceKm: 0.111,
      averageSpeedKmh: 80,
      maxSpeedKmh: 90,
    });
  }
  return {
    points,
    laps,
    profile: {
      schemaVersion: 1,
      id: "test",
      name: "Test Circuit",
      centerline: { type: "LineString", coordinates: [[0, 0], [0.001, 0]] },
      direction: "clockwise",
      sectorGates: [],
      sections: [{ id: "c1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 10, endDistanceMeters: 90 }],
      source: { kind: "user" },
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
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
