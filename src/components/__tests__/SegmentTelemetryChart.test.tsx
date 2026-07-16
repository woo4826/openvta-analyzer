import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import type { SegmentAnalysisResult, SynchronizedAccelerationSeries } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import {
  buildSegmentTelemetryMetricOption,
  buildSegmentTelemetryOption,
  downsampleAcceleration,
  MAX_RENDERED_IMU_SAMPLES,
  type SegmentTelemetryLabels,
} from "../segmentTelemetryOptions";

const chartPanelSpy = vi.hoisted(() => ({
  onPointReferences: [] as Array<((index: number, domainValue?: number) => void) | undefined>,
  onHoverReferences: [] as Array<((domainValue: number) => void) | undefined>,
  onCursorKeyReferences: [] as Array<((action: "previous" | "next" | "page-previous" | "page-next" | "start" | "end") => void) | undefined>,
}));
vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ title, option, cursorX, onPoint, onHoverDomain, onCursorKey, describedBy, actions, caption }: { title: string; option: EChartsOption; cursorX?: number; onPoint?: (index: number, domainValue?: number) => void; onHoverDomain?: (domainValue: number) => void; onCursorKey?: (action: "previous" | "next" | "page-previous" | "page-next" | "start" | "end") => void; describedBy?: string; actions?: unknown; caption?: unknown }) => {
    chartPanelSpy.onPointReferences.push(onPoint);
    chartPanelSpy.onHoverReferences.push(onHoverDomain);
    chartPanelSpy.onCursorKeyReferences.push(onCursorKey);
    return <div data-testid="segment-chart" data-title={title} data-option={JSON.stringify(option)} data-cursor-x={cursorX} aria-describedby={describedBy}>
        {actions as ReactNode}
        {caption as ReactNode}
        <button type="button" onClick={() => onPoint?.(21, 2)}>Emit point</button>
        <button type="button" onClick={() => onHoverDomain?.(2)}>Emit hover</button>
        <button type="button" onClick={() => onCursorKey?.("next")}>Next keyboard sample</button>
      </div>;
  },
}));

import { SegmentTelemetryChart } from "../SegmentTelemetryChart";

describe("segment telemetry chart", () => {
  it("builds isolated speed, Delta-T, and measured-acceleration chart options", () => {
    const zoom = { start: 10, end: 80 };
    const speed = buildSegmentTelemetryMetricOption(
      analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1",
      labels(), "speed", undefined, zoom, false,
    ) as {
      grid: unknown;
      series: Array<{ id: string }>;
      dataZoom: Array<Record<string, unknown>>;
    };
    const delta = buildSegmentTelemetryMetricOption(
      analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1",
      labels(), "delta", undefined, zoom, false,
    ) as { series: Array<{ id: string }> };
    const measuredAcceleration = buildSegmentTelemetryMetricOption(
      analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1",
      labels(), "imu-acceleration", acceleration(), zoom, true,
    ) as {
      series: Array<{ id: string }>;
      dataZoom: Array<Record<string, unknown>>;
    };

    expect(speed.grid).not.toBeInstanceOf(Array);
    expect(speed.series.map((series) => series.id)).toEqual(["lap-2-speed", "lap-1-speed"]);
    expect(delta.series.map((series) => series.id)).toEqual(["lap-2-delta"]);
    expect(measuredAcceleration.series.map((series) => series.id)).toEqual([
      "imu-acceleration-x", "imu-acceleration-y", "imu-acceleration-z",
    ]);
    expect(speed.dataZoom).toEqual([
      expect.objectContaining({ type: "inside", start: 10, end: 80 }),
    ]);
    expect(measuredAcceleration.dataZoom).toEqual([
      expect.objectContaining({ type: "inside", start: 10, end: 80 }),
      expect.objectContaining({ type: "slider", start: 10, end: 80 }),
    ]);
  });

  it("builds three linked core grids including synchronized measured device acceleration", () => {
    const option = buildSegmentTelemetryOption(
      analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1", undefined, undefined, acceleration(),
    ) as {
      grid: unknown[];
      series: Array<{ id: string; name: string; data: number[][]; markLine?: { data: Array<{ xAxis?: number }> } }>;
      legend: { data: string[] };
      dataZoom: Array<Record<string, unknown>>;
      axisPointer: { link: Array<Record<string, unknown>> };
    };

    expect(option.grid).toHaveLength(3);
    expect(option.series.filter((series) => series.name === "Focused · Lap 2")).toHaveLength(2);
    expect(option.series.map((series) => series.id)).toEqual(expect.arrayContaining([
      "lap-2-speed", "lap-2-delta",
      "imu-acceleration-x", "imu-acceleration-y", "imu-acceleration-z",
    ]));
    expect(option.legend.data).toEqual(["Focused · Lap 2", "Reference · Lap 1", "Device X", "Device Y", "Device Z"]);
    expect(option.series.every((series) => series.data.every((point) => point.length === 3))).toBe(true);
    expect(option.dataZoom).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "inside", xAxisIndex: [0, 1, 2] }),
    ]));
    expect(option.axisPointer).toEqual(expect.objectContaining({ link: [{ xAxisIndex: "all" }] }));
    const grids = option.grid as Array<{ top: string; height: string }>;
    for (let index = 0; index < grids.length - 1; index += 1) {
      expect(Number.parseFloat(grids[index].top) + Number.parseFloat(grids[index].height))
        .toBeLessThanOrEqual(Number.parseFloat(grids[index + 1].top));
    }
  });

  it("switches to elapsed time and resolves continuous hover domain to the focused source sample", () => {
    const onCursor = vi.fn();
    render(
      <I18nProvider>
        <SegmentTelemetryChart
          analysis={analysis()}
          visibleLapIds={["lap-1", "lap-2"]}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          axis="time"
          synchronizedAcceleration={acceleration("sensor-clock")}
          cursorDistanceMeters={50}
          onCursor={onCursor}
        />
      </I18nProvider>,
    );

    const option = JSON.parse(screen.getByTestId("segment-chart").getAttribute("data-option")!);
    expect(option.grid).toHaveLength(3);
    expect(option.xAxis.every((xAxis: { min: number; max: number }) => xAxis.min === 0 && xAxis.max === 4)).toBe(true);
    expect(option.series.map((series: { id: string }) => series.id)).toEqual([
      "lap-2-speed", "lap-2-delta", "lap-1-speed", "lap-1-delta",
      "imu-acceleration-x", "imu-acceleration-y", "imu-acceleration-z",
    ]);
    const speed = option.series.find((series: { id: string }) => series.id === "lap-2-speed");
    expect(speed.data[1][0]).toBe(2);
    expect(screen.getByTestId("segment-chart")).toHaveAttribute("data-cursor-x", "2");
    expect(screen.getByTestId("segment-chart")).toHaveAttribute("data-title", "Lap telemetry");
    expect(screen.getByText("Sensor clock · 3 samples")).toBeInTheDocument();
    expect(screen.getByText(/Focused − Reference/)).toBeVisible();
    expect(screen.getByText(/raw focused-lap device axes/)).toBeVisible();
    expect(screen.getByRole("img", { name: "Focused and reference trajectories with synchronized cursor markers" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Select range" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Detailed channels" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    expect(screen.getByText("Focused lap", { selector: "dt" })).toBeInTheDocument();

    const beforeHover = chartPanelSpy.onHoverReferences.at(-1);
    fireEvent.click(screen.getByRole("button", { name: "Emit hover" }));
    expect(chartPanelSpy.onHoverReferences.at(-1)).toBe(beforeHover);
    expect(onCursor).toHaveBeenCalledWith(50, 21);
    fireEvent.click(screen.getByRole("button", { name: "Emit point" }));
    expect(onCursor).toHaveBeenCalledWith(50, 21);
    fireEvent.click(screen.getByRole("button", { name: "Next keyboard sample" }));
    expect(onCursor).toHaveBeenCalledWith(100, 22);
  });

  it("keeps the reference calculation but removes its plotted series in focused-only mode", () => {
    const option = buildSegmentTelemetryOption(analysis(), ["lap-2"], "distance", "lap-2", "lap-1") as {
      series: Array<{ id: string }>;
      legend: { data: string[] };
    };

    expect(option.series.map((series) => series.id)).toEqual([
      "lap-2-speed", "lap-2-delta",
    ]);
    expect(option.legend.data).toEqual(["Focused · Lap 2"]);
  });

  it("plots every requested presentation lap without the former five-lap ceiling", () => {
    const manyLaps = analysisWithLapCount(7);
    const visibleLapIds = manyLaps.records.map((record) => record.lapId);
    const option = buildSegmentTelemetryOption(
      manyLaps,
      visibleLapIds,
      "distance",
      "lap-7",
      "lap-1",
      undefined,
      ["speed"],
    ) as {
      series: Array<{ id: string }>;
      legend: { data: string[] };
    };

    expect(option.series.map((series) => series.id)).toHaveLength(7);
    expect(option.series.map((series) => series.id)).toEqual(expect.arrayContaining(
      visibleLapIds.map((lapId) => `${lapId}-speed`),
    ));
    expect(option.legend.data).toHaveLength(7);
  });

  it("bounds rendered IMU points while preserving endpoint and axis extrema", () => {
    const samples = Array.from({ length: 10_000 }, (_, index) => ({
      sensorIndex: index,
      sourceIndex: index,
      distanceMeters: index,
      elapsedSeconds: index / 100,
      accelXG: index === 4_321 ? 12 : Math.sin(index / 10),
      accelYG: index === 6_543 ? -11 : Math.cos(index / 10),
      accelZG: index === 7_654 ? 14 : 1,
    }));

    const rendered = downsampleAcceleration(samples);

    expect(rendered.length).toBeLessThanOrEqual(MAX_RENDERED_IMU_SAMPLES);
    expect(rendered[0]).toBe(samples[0]);
    expect(rendered.at(-1)).toBe(samples.at(-1));
    expect(rendered).toContain(samples[4_321]);
    expect(rendered).toContain(samples[6_543]);
    expect(rendered).toContain(samples[7_654]);
  });

  it("removes the duplicate keyboard range editor from the telemetry widget", () => {
    const fractional = analysis();
    fractional.range = { startDistanceMeters: 1000, endDistanceMeters: 1100.6 };
    render(<I18nProvider><SegmentTelemetryChart
      analysis={fractional}
      visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2"
      referenceLapId="lap-1"
      axis="distance"
      onCursor={vi.fn()}
    /></I18nProvider>);

    expect(screen.queryByRole("spinbutton", { name: "End (m)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analyze range" })).not.toBeInTheDocument();
  });
});

function acceleration(method: SynchronizedAccelerationSeries["method"] = "line-order"): SynchronizedAccelerationSeries {
  return {
    method,
    samples: [0, 50, 100].map((distance, index) => ({
      sensorIndex: index,
      sourceIndex: 20 + index,
      distanceMeters: distance,
      elapsedSeconds: index * 2,
      accelXG: index * 0.1,
      accelYG: index * -0.2,
      accelZG: 1 + index * 0.05,
    })),
  };
}

function labels(): SegmentTelemetryLabels {
  return {
    speed: "Speed",
    imuAcceleration: "Measured acceleration",
    imuAxisX: "Device X",
    imuAxisY: "Device Y",
    imuAxisZ: "Device Z",
    acceleration: "GPS speed derivative",
    elapsed: "Elapsed time",
    delta: "Delta-T",
    loss: "Loss rate",
    distanceAxis: "Distance (m)",
    timeAxis: "Elapsed time (s)",
    lap: "Lap",
    focusedLap: "Focused",
    referenceLap: "Reference",
    maximumDelta: "Maximum delta",
  };
}

function analysis(): SegmentAnalysisResult {
  return {
    scope: { kind: "section", sectionId: "c1" },
    range: { startDistanceMeters: 1000, endDistanceMeters: 1100 },
    referenceLapId: "lap-1",
    fastestLapId: "lap-2",
    shortestLapId: "lap-1",
    records: [1, 2].map((ordinal) => ({
      lapId: `lap-${ordinal}`,
      ordinal,
      completion: "complete",
      validity: "valid",
      flags: [],
      fromPartialLap: false,
      coverage: "complete",
      eligibleForBest: true,
      durationSeconds: ordinal * 4,
      drivenDistanceMeters: 100,
      gpsConfidence: "high",
      trajectory: [0, 50, 100].map((distance, index) => ({
        distanceMeters: distance,
        elapsedSeconds: index * ordinal,
        speedKmh: 100 - ordinal * 5 - index,
        latitude: 38,
        longitude: 128 + index * 0.001,
        sourceIndex: ordinal * 10 + index,
        referenceElapsedSeconds: index,
        deltaSeconds: index * (ordinal - 1) * 0.2,
        pathDistanceMeters: distance,
        signedOffsetMeters: ordinal,
        lossRateSecondsPer100m: index ? ordinal * 0.1 : 0,
      })),
    })),
  };
}

function analysisWithLapCount(count: number): SegmentAnalysisResult {
  const result = analysis();
  const template = result.records[0];
  result.records = Array.from({ length: count }, (_, index) => ({
    ...template,
    lapId: `lap-${index + 1}`,
    ordinal: index + 1,
    trajectory: template.trajectory.map((sample) => ({ ...sample })),
  }));
  result.referenceLapId = "lap-1";
  result.fastestLapId = "lap-1";
  result.shortestLapId = "lap-1";
  return result;
}
