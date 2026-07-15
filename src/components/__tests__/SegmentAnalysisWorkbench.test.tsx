import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsPoint, LapResult, SensorPoint, TrackProfileV1 } from "../../domain/types";
import { SEGMENT_WORKBENCH_STORAGE_KEY } from "../../domain/segmentWorkbenchPreferences";
import { I18nProvider } from "../../i18n/I18nProvider";

vi.mock("../SegmentTrajectoryMap", () => ({
  SegmentTrajectoryMap: ({ focusedLapId, referenceLapId, cursorDistanceMeters, onSelectedIndex, onSegmentChange }: { focusedLapId?: string; referenceLapId?: string; cursorDistanceMeters?: number; onSelectedIndex: (index: number) => void; onSegmentChange: (segment: { startIndex: number; endIndex: number; source: "map" }) => void }) => (
    <div data-testid="map-state">roles={focusedLapId},{referenceLapId}:cursor={cursorDistanceMeters}<button type="button" onClick={() => onSelectedIndex(4)}>Select map point</button><button type="button" onClick={() => onSegmentChange({ startIndex: 0, endIndex: 1, source: "map" })}>Select map range</button></div>
  ),
}));
vi.mock("../SegmentTelemetryChart", () => ({
  SegmentTelemetryChart: ({ focusedLapId, referenceLapId, visibleLapIds, cursorDistanceMeters, synchronizedAcceleration, onRange, onCursor }: { focusedLapId?: string; referenceLapId?: string; visibleLapIds: string[]; cursorDistanceMeters?: number; synchronizedAcceleration?: { method: string; samples: unknown[] }; onRange: (start: number, end: number) => void; onCursor: (distance: number, sourceIndex: number) => void }) => (
    <div data-testid="chart-state">roles={focusedLapId},{referenceLapId}:visible={visibleLapIds.join(",")}:cursor={cursorDistanceMeters}:sync={synchronizedAcceleration?.method}:{synchronizedAcceleration?.samples.length}<button type="button" onClick={() => onCursor(56, 4)}>Select graph point</button><button type="button" onClick={() => onRange(20, 60)}>Select graph range</button></div>
  ),
}));
vi.mock("../SegmentVariationChart", () => ({
  SegmentVariationChart: ({ focusedLapId, referenceLapId, visibleLapIds }: { focusedLapId?: string; referenceLapId?: string; visibleLapIds: string[] }) => (
    <div data-testid="variation-state">roles={focusedLapId},{referenceLapId}:visible={visibleLapIds.join(",")}</div>
  ),
}));

import { SegmentAnalysisWorkbench } from "../SegmentAnalysisWorkbench";

describe("SegmentAnalysisWorkbench", () => {
  beforeEach(() => localStorage.removeItem(SEGMENT_WORKBENCH_STORAGE_KEY));

  it("releases map and chart resources while the preserved workbench is inactive", () => {
    const fixture = data();
    render(<I18nProvider><SegmentAnalysisWorkbench
      active={false}
      sourceName="session.Vta"
      points={fixture.points}
      sensors={fixture.sensors}
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
    expect(screen.getByRole("button", { name: "Analysis controls" })).toBeInTheDocument();
  });

  it("synchronizes scope and focused lap across ribbon, map, graph, and lap table", async () => {
    const user = userEvent.setup();
    const fixture = data();
    const onSelectedPointIndex = vi.fn();
    render(<I18nProvider><SegmentAnalysisWorkbench
      sourceName="session.Vta"
      points={fixture.points}
      sensors={fixture.sensors}
      laps={fixture.laps}
      profile={fixture.profile}
      analysisLine={fixture.profile.centerline}
      includePartialLapSections={false}
      onIncludePartialLapSections={vi.fn()}
      mapSettings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
      selectedPointIndex={0}
      onSelectedPointIndex={onSelectedPointIndex}
      onMapSettingsChange={vi.fn()}
      onActiveSegment={vi.fn()}
      onSaveRange={vi.fn()}
      onOpenSetup={vi.fn()}
    /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Analysis controls" }));
    expect(screen.getByRole("region", { name: "Segment Analysis Workbench" })).toHaveClass("is-controls-open");
    const controls = screen.getByRole("dialog", { name: "Analysis controls" });
    await user.click(within(controls).getByRole("button", { name: "Corner 1, 10–90 m" }));
    expect(screen.getByText(/Corner 1 · 10–90 m/)).toBeVisible();
    await user.selectOptions(within(controls).getByRole("combobox", { name: "Focused lap" }), "lap-1");
    expect(screen.getByTestId("map-state")).toHaveTextContent("roles=lap-1,lap-2");
    await user.selectOptions(within(controls).getByRole("combobox", { name: "Focused lap" }), "lap-2");
    expect(screen.getByTestId("map-state")).toHaveTextContent("roles=lap-2,lap-1");
    expect(screen.getByTestId("chart-state")).toHaveTextContent("roles=lap-2,lap-1");
    expect(screen.getByTestId("chart-state")).toHaveTextContent("sync=timestamp:1");
    await user.click(screen.getByRole("button", { name: "Select graph point" }));
    expect(onSelectedPointIndex).toHaveBeenCalledWith(4);
    expect(screen.getByTestId("map-state")).toHaveTextContent("cursor=56");
    expect(screen.getByRole("heading", { name: "Test Circuit" })).toBeVisible();
    expect(screen.queryByText("Where am I losing time?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select map range" }));
    expect(screen.getByText(/Custom range · 0–56 m/)).toBeVisible();
  });

  it("shows only the focused lap and persists optional widget visibility", async () => {
    const user = userEvent.setup();
    const fixture = data(3);
    render(<I18nProvider><SegmentAnalysisWorkbench
      sourceName="session.Vta" points={fixture.points} sensors={fixture.sensors} laps={fixture.laps} profile={fixture.profile}
      analysisLine={fixture.profile.centerline} includePartialLapSections={false}
      onIncludePartialLapSections={vi.fn()} mapSettings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
      selectedPointIndex={0} onSelectedPointIndex={vi.fn()} onMapSettingsChange={vi.fn()}
      onActiveSegment={vi.fn()} onSaveRange={vi.fn()} onOpenSetup={vi.fn()}
    /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Analysis controls" }));
    const controls = screen.getByRole("dialog", { name: "Analysis controls" });
    await user.selectOptions(within(controls).getByRole("combobox", { name: "Visible laps" }), "focus-only");

    expect(screen.getByTestId("map-state")).toHaveTextContent("roles=lap-3,lap-1");
    expect(screen.getByTestId("map-state")).not.toHaveTextContent("lap-2");
    expect(screen.getByTestId("chart-state")).toHaveTextContent("visible=lap-3");
    expect(screen.getByTestId("variation-state")).toHaveTextContent("visible=lap-3");
    expect(screen.getByRole("rowheader", { name: /Lap 3/ })).toBeVisible();
    expect(screen.queryByRole("rowheader", { name: /Lap 1/ })).not.toBeInTheDocument();

    await user.selectOptions(within(controls).getByRole("combobox", { name: "Visible laps" }), "all");
    expect(screen.getByTestId("map-state")).toHaveTextContent("roles=lap-3,lap-1");
    expect(screen.getByTestId("map-state")).not.toHaveTextContent("lap-2");
    expect(screen.getByTestId("chart-state")).toHaveTextContent("visible=lap-1,lap-2,lap-3");
    expect(screen.getByTestId("variation-state")).toHaveTextContent("visible=lap-1,lap-2,lap-3");
    expect(screen.getByRole("rowheader", { name: /Lap 2/ })).toBeVisible();

    await user.selectOptions(within(controls).getByRole("combobox", { name: "Visible laps" }), "focus-only");
    await user.click(within(controls).getByRole("checkbox", { name: "Time-loss ranking" }));
    expect(screen.queryByRole("region", { name: "Time-loss ranking" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SEGMENT_WORKBENCH_STORAGE_KEY) ?? "{}")).toMatchObject({
      lapVisibility: "focus-only",
      visibleWidgets: { opportunities: false },
    });
  });

  it("saves a graph-selected range as a named track section", async () => {
    const user = userEvent.setup();
    const fixture = data();
    const onSaveRange = vi.fn();
    render(<I18nProvider><SegmentAnalysisWorkbench
      sourceName="session.Vta"
      points={fixture.points}
      sensors={fixture.sensors}
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

function data(lapCount = 2): { points: GpsPoint[]; sensors: SensorPoint[]; laps: LapResult[]; profile: TrackProfileV1 } {
  const points: GpsPoint[] = [];
  const laps: LapResult[] = [];
  for (let lapIndex = 0; lapIndex < lapCount; lapIndex += 1) {
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
    sensors: [sensor(0, 26)],
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

function sensor(index: number, seconds: number): SensorPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    elapsedSeconds: seconds,
    eventCode: 0,
    accelX: 1,
    accelY: 2,
    accelZ: 9.8,
    accelUnit: "mps2",
    timestampNanos: seconds * 1_000_000_000,
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
