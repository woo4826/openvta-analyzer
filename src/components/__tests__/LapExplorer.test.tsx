import type { EChartsOption } from "echarts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsPoint, LapResult, LapSectionResult, TrackSection } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";

const capturedOptions = vi.hoisted((): EChartsOption[] => []);

vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ title, option }: { title: string; option: EChartsOption }) => {
    capturedOptions.push(option);
    return <section><h3>{title}</h3></section>;
  },
}));

import { LapExplorer } from "../LapExplorer";

describe("LapExplorer", () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  it("navigates whole lap, corners, and straights and rebases graph distance", async () => {
    const user = userEvent.setup();
    render(<I18nProvider><LapExplorer {...props()} /></I18nProvider>);

    await user.selectOptions(screen.getByLabelText("Analysis scope"), "corner-1");

    expect(screen.getByRole("heading", { name: "Corner 1 lap comparison" })).toBeVisible();
    expect(firstSeriesData(latestChartOption())[0][0]).toBe(0);
    await user.click(screen.getByRole("button", { name: "Next scope" }));
    expect(screen.getByLabelText("Analysis scope")).toHaveValue("straight-2");
  });

  it("opens a matrix row in the graph and shows every selected lap metric", async () => {
    const user = userEvent.setup();
    render(<I18nProvider><LapExplorer {...props()} /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Analyze Corner 1" }));

    expect(screen.getByRole("table", { name: "Selected scope lap metrics" })).toHaveTextContent("Lap 1");
    expect(screen.getByRole("table", { name: "Selected scope lap metrics" })).toHaveTextContent("Lap 2");
    expect(screen.getByRole("table", { name: "Selected scope lap metrics" })).toHaveTextContent("Entry speed");
  });

  it("offers inside and slider zoom plus chart restore", () => {
    render(<I18nProvider><LapExplorer {...props()} /></I18nProvider>);

    expect(latestChartOption().dataZoom).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "inside" }),
      expect.objectContaining({ type: "slider" }),
    ]));
    expect(latestChartOption().toolbox).toEqual(expect.objectContaining({ feature: { restore: {} } }));
  });
});

function props() {
  const firstPoints = [0, 0.0006, 0.0012, 0.0018, 0.0024, 0.003]
    .map((longitude, index) => gps(longitude, 0, index * 4, 90));
  const secondPoints = [0, 0.0006, 0.0012, 0.0018, 0.0024, 0.003]
    .map((longitude, index) => gps(longitude, 0.00002, 30 + index * 3, 105));
  const points = [...firstPoints, ...secondPoints].map((point, index) => ({ ...point, index, lineNumber: index + 1 }));
  const laps = [
    lap("lap-1", 1, 0, 5, 0, 20),
    lap("lap-2", 2, 6, 11, 30, 45),
  ];
  const sections: TrackSection[] = [
    { id: "straight-1", name: "Straight 1", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 100 },
    { id: "corner-1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 100, endDistanceMeters: 220 },
    { id: "straight-2", name: "Straight 2", kind: "straight", startDistanceMeters: 220, endDistanceMeters: 333.5 },
  ];
  const sectionResults = laps.flatMap((item, lapIndex) => sections.map((section, sectionIndex): LapSectionResult => ({
    id: `${item.id}-${section.id}`,
    lapId: item.id,
    sectionId: section.id,
    name: section.name,
    kind: section.kind,
    durationSeconds: 5 + sectionIndex + lapIndex,
    deltaBestSeconds: lapIndex,
    entrySpeedKmh: 100,
    minimumSpeedKmh: 70,
    averageSpeedKmh: 85,
    maximumSpeedKmh: 110,
    exitSpeedKmh: 95,
    maxLateralG: 1.1,
    maxDecelerationG: 0.8,
    fromPartialLap: false,
    eligibleForBest: true,
  })));
  return {
    profileId: "test-profile",
    points,
    laps,
    selectedLapIds: laps.map((item) => item.id),
    primaryLapId: laps[0].id,
    referenceLapId: laps[1].id,
    analysisLine: { type: "LineString" as const, coordinates: [[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]] },
    sections,
    sectionResults,
  };
}

function latestChartOption(): EChartsOption {
  const option = capturedOptions.at(-1);
  if (!option) throw new Error("Expected a chart option.");
  return option;
}

function firstSeriesData(option: EChartsOption): number[][] {
  const series = Array.isArray(option.series) ? option.series[0] : option.series;
  return (series as { data: number[][] }).data;
}

function lap(id: string, ordinal: number, startIndex: number, endIndex: number, startSeconds: number, endSeconds: number): LapResult {
  return {
    id,
    ordinal,
    completion: "complete",
    validity: "valid",
    flags: [],
    start: { id: `${id}-start`, source: "auto", pointIndex: startIndex, elapsedSeconds: startSeconds, coordinate: [0, 0] },
    end: { id: `${id}-end`, source: "auto", pointIndex: endIndex, elapsedSeconds: endSeconds, coordinate: [0.003, 0] },
    startIndex,
    endIndex,
    durationSeconds: endSeconds - startSeconds,
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
