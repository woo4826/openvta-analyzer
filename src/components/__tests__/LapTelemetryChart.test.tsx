import type { EChartsOption } from "echarts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsPoint, LapResult } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LapTelemetryChart } from "../LapTelemetryChart";

const captured = vi.hoisted((): Array<{ option: EChartsOption; onBrushSegment?: (start: number, end: number) => void }> => []);

vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ title, option, actions, onBrushSegment }: {
    title: string;
    option: EChartsOption;
    actions?: React.ReactNode;
    onBrushSegment?: (start: number, end: number) => void;
  }) => {
    captured.push({ option, onBrushSegment });
    return <section><h3>{title}</h3>{actions}</section>;
  },
}));

describe("LapTelemetryChart", () => {
  beforeEach(() => captured.length = 0);

  it("shows linked time-based speed, acceleration, and Delta-T channels by default", () => {
    renderChart();

    const option = latestOption();
    expect(seriesNames(option)).toEqual(["Speed", "Derived acceleration", "Delta-T"]);
    expect(option.xAxis).toHaveLength(3);
    expect(option.dataZoom).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "inside", xAxisIndex: [0, 1, 2] }),
      expect.objectContaining({ type: "slider", xAxisIndex: [0, 1, 2] }),
    ]));
    expect(option.toolbox).toEqual(expect.objectContaining({
      feature: expect.objectContaining({ brush: expect.anything(), restore: {} }),
    }));
    expect(firstSeriesData(option)[0]).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Time" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the linked horizontal axes to distance and forwards brushed GPS indexes", async () => {
    const user = userEvent.setup();
    const onActiveSegment = vi.fn();
    renderChart(onActiveSegment);

    await user.click(screen.getByRole("button", { name: "Distance" }));
    expect(axisNames(latestOption())).toEqual(["Distance (m)", "Distance (m)", "Distance (m)"]);

    captured.at(-1)?.onBrushSegment?.(3, 8);
    expect(onActiveSegment).toHaveBeenCalledWith({ startIndex: 3, endIndex: 8, source: "chart" });
  });
});

function renderChart(onActiveSegment = vi.fn()) {
  const first = [0, 0.001, 0.002, 0.003].map((longitude, index) => gps(longitude, 0, index * 5, 80 + index * 5));
  const second = [0, 0.001, 0.002, 0.003].map((longitude, index) => gps(longitude, 0.00001, 30 + index * 4, 85 + index * 5));
  const points = [...first, ...second].map((point, index) => ({ ...point, index, lineNumber: index + 1 }));
  render(
    <I18nProvider>
      <LapTelemetryChart
        points={points}
        primaryLap={lap("lap-1", 1, 0, 3, 0, 15)}
        referenceLap={lap("lap-2", 2, 4, 7, 30, 42)}
        analysisLine={{ type: "LineString", coordinates: [[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]] }}
        selectedPointIndex={0}
        onSelectedPointIndex={vi.fn()}
        onActiveSegment={onActiveSegment}
      />
    </I18nProvider>,
  );
}

function latestOption(): EChartsOption {
  const option = captured.at(-1)?.option;
  if (!option) throw new Error("Expected a telemetry chart option.");
  return option;
}

function optionSeries(option: EChartsOption): Array<{ name?: unknown; data?: unknown }> {
  if (!option.series) return [];
  return Array.isArray(option.series)
    ? option.series as Array<{ name?: unknown; data?: unknown }>
    : [option.series as { name?: unknown; data?: unknown }];
}

function seriesNames(option: EChartsOption): string[] {
  return optionSeries(option).map((series) => String(series.name));
}

function firstSeriesData(option: EChartsOption): number[][] {
  return optionSeries(option)[0].data as number[][];
}

function axisNames(option: EChartsOption): string[] {
  return (option.xAxis as Array<{ name?: unknown }>).map((axis) => String(axis.name));
}

function lap(id: string, ordinal: number, startIndex: number, endIndex: number, start: number, end: number): LapResult {
  return {
    id,
    ordinal,
    completion: "complete",
    validity: "valid",
    flags: [],
    start: { id: `${id}-start`, source: "auto", pointIndex: startIndex, elapsedSeconds: start, coordinate: [0, 0] },
    end: { id: `${id}-end`, source: "auto", pointIndex: endIndex, elapsedSeconds: end, coordinate: [0.003, 0] },
    startIndex,
    endIndex,
    durationSeconds: end - start,
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
