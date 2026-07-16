import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import type { SegmentAnalysisResult, SynchronizedAccelerationSeries } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import {
  buildSegmentTelemetryMetricOption,
  type SegmentTelemetryLabels,
} from "../segmentTelemetryOptions";

const chartPanelSpy = vi.hoisted(() => ({
  onPointReferences: [] as Array<((index: number, domainValue?: number) => void) | undefined>,
  onHoverReferences: [] as Array<((domainValue: number) => void) | undefined>,
  onCursorKeyReferences: [] as Array<((action: "previous" | "next" | "page-previous" | "page-next" | "start" | "end") => void) | undefined>,
  onZoomReferences: [] as Array<((window: { start: number; end: number }) => void) | undefined>,
  onBrushReferences: [] as Array<((start: number, end: number) => void) | undefined>,
}));
const vectorPanelSpy = vi.hoisted(() => ({
  props: [] as Array<{ cursorDistanceMeters: number; mode: string; focused?: SynchronizedAccelerationSeries; reference?: SynchronizedAccelerationSeries }>,
}));
vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ title, ariaLabel, option, cursorX, interactionMode, onPoint, onHoverDomain, onCursorKey, onZoomWindow, onBrushRange, describedBy, actions, caption }: { title: string; ariaLabel?: string; option: EChartsOption; cursorX?: number; interactionMode?: string; onPoint?: (index: number, domainValue?: number) => void; onHoverDomain?: (domainValue: number) => void; onCursorKey?: (action: "previous" | "next" | "page-previous" | "page-next" | "start" | "end") => void; onZoomWindow?: (window: { start: number; end: number }) => void; onBrushRange?: (start: number, end: number) => void; describedBy?: string; actions?: unknown; caption?: unknown }) => {
    chartPanelSpy.onPointReferences.push(onPoint);
    chartPanelSpy.onHoverReferences.push(onHoverDomain);
    chartPanelSpy.onCursorKeyReferences.push(onCursorKey);
    chartPanelSpy.onZoomReferences.push(onZoomWindow);
    chartPanelSpy.onBrushReferences.push(onBrushRange);
    return <section>
      <div data-testid="segment-chart" data-title={title} data-option={JSON.stringify(option)} data-cursor-x={cursorX} data-interaction-mode={interactionMode} aria-describedby={describedBy} role="img" aria-label={ariaLabel ?? title} />
      {actions as ReactNode}
      {caption as ReactNode}
        <button type="button" onClick={() => onPoint?.(21, 2)}>Point {title}</button>
        <button type="button" onClick={() => onHoverDomain?.(2)}>Hover {title}</button>
        <button type="button" onClick={() => onCursorKey?.("next")}>Next {title}</button>
        <button type="button" onClick={() => onZoomWindow?.({ start: 25, end: 70 })}>Zoom {title}</button>
        <button type="button" onClick={() => onBrushRange?.(25, 75)}>Brush {title}</button>
    </section>;
  },
}));
vi.mock("../SegmentAccelerationVectorPanel", () => ({
  SegmentAccelerationVectorPanel: ({ focused, reference, cursorDistanceMeters, mode, onMode }: {
    focused?: SynchronizedAccelerationSeries;
    reference?: SynchronizedAccelerationSeries;
    cursorDistanceMeters: number;
    mode: string;
    onMode: (mode: "gg-2d" | "vector-3d") => void;
  }) => {
    vectorPanelSpy.props.push({ focused, reference, cursorDistanceMeters, mode });
    return <section data-testid="acceleration-vector-panel" data-cursor-distance={cursorDistanceMeters} data-mode={mode}>
      <span>{focused?.samples.length ? "Acceleration vector" : "Measured acceleration unavailable"}</span>
      <span>{reference?.samples.length ? "Reference acceleration" : "Reference acceleration unavailable"}</span>
      <button type="button" onClick={() => onMode("vector-3d")}>Choose 3D acceleration</button>
    </section>;
  },
}));

import { SegmentTelemetryChart } from "../SegmentTelemetryChart";

describe("segment telemetry chart", () => {
  beforeEach(() => {
    chartPanelSpy.onPointReferences.length = 0;
    chartPanelSpy.onHoverReferences.length = 0;
    chartPanelSpy.onCursorKeyReferences.length = 0;
    chartPanelSpy.onZoomReferences.length = 0;
    chartPanelSpy.onBrushReferences.length = 0;
    vectorPanelSpy.props.length = 0;
  });
  it("builds isolated speed and Delta-T chart options", () => {
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
      labels(), "delta", undefined, zoom, true,
    ) as { series: Array<{ id: string }>; dataZoom: Array<Record<string, unknown>> };
    expect(speed.grid).not.toBeInstanceOf(Array);
    expect(speed.series.map((series) => series.id)).toEqual(["lap-2-speed", "lap-1-speed"]);
    expect(delta.series.map((series) => series.id)).toEqual(["lap-2-delta", "lap-1-delta"]);
    expect(speed.dataZoom).toEqual([
      expect.objectContaining({ type: "inside", start: 10, end: 80 }),
    ]);
    expect(delta.dataZoom).toEqual([
      expect.objectContaining({ type: "inside", start: 10, end: 80 }),
      expect.objectContaining({ type: "slider", start: 10, end: 80 }),
    ]);
  });

  it("shares elapsed-time hover, click, keyboard, zoom, and cursor state across both graphs and the vector panel", () => {
    const onCursor = vi.fn();
    render(
      <I18nProvider>
        <SegmentTelemetryChart
          analysis={analysis()}
          visibleLapIds={["lap-1", "lap-2"]}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          axis="time"
          synchronizedAccelerationByLap={accelerationByLap("sensor-clock")}
          cursorDistanceMeters={50}
          layout="three-column"
          onLayout={vi.fn()}
          onCursor={onCursor}
        />
      </I18nProvider>,
    );

    const charts = screen.getAllByTestId("segment-chart");
    expect(charts).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Speed comparison by time" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Delta-T by time" })).toBeVisible();
    expect(screen.getByTestId("acceleration-vector-panel")).toHaveAttribute("data-cursor-distance", "50");
    expect(charts.map((chart) => chart.getAttribute("data-cursor-x"))).toEqual(["2", "2"]);

    const speedOption = chartOption("Speed");
    const deltaOption = chartOption("Delta-T");
    expect(speedOption.xAxis).toMatchObject({ min: 0, max: 4 });
    expect(speedOption.series.map((series: { id: string }) => series.id)).toEqual(["lap-2-speed", "lap-1-speed"]);
    expect(deltaOption.series.map((series: { id: string }) => series.id)).toEqual(["lap-2-delta", "lap-1-delta"]);
    const speed = speedOption.series.find((series: { id: string }) => series.id === "lap-2-speed")!;
    expect(speed.data[1][0]).toBe(2);
    expect(screen.getByText("Sensor clock · 3 samples")).toBeInTheDocument();
    expect(screen.getByText(/Focused − Reference/)).toBeVisible();
    expect(screen.getByText(/raw device axes for each selected lap/)).toBeVisible();
    expect(screen.getByText(/Device X \+0\.10 g.*Device Y -0\.20 g.*Device Z \+1\.05 g/)).toBeVisible();
    expect(screen.getByRole("img", { name: "Focused and reference trajectories with synchronized cursor markers" })).toBeVisible();
    expect(screen.getByText("Focused lap", { selector: "dt" })).toBeInTheDocument();

    for (const title of ["Speed", "Delta-T"]) {
      fireEvent.click(screen.getByRole("button", { name: `Hover ${title}` }));
      expect(onCursor).toHaveBeenLastCalledWith(50, 21);
      fireEvent.click(screen.getByRole("button", { name: `Point ${title}` }));
      expect(onCursor).toHaveBeenLastCalledWith(50, 21);
      fireEvent.click(screen.getByRole("button", { name: `Next ${title}` }));
      expect(onCursor).toHaveBeenLastCalledWith(100, 22);
    }

    fireEvent.click(screen.getByRole("button", { name: "Zoom Delta-T" }));
    for (const title of ["Speed", "Delta-T"]) {
      expect(chartOption(title).dataZoom).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "inside", start: 25, end: 70 }),
      ]));
    }
  });

  it("offers every controlled telemetry layout", () => {
    const onLayout = vi.fn();
    const onAccelerationVectorMode = vi.fn();
    render(<I18nProvider><SegmentTelemetryChart
      analysis={analysis()} visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
      synchronizedAccelerationByLap={accelerationByLap()} layout="three-column"
      accelerationVectorMode="gg-2d" onAccelerationVectorMode={onAccelerationVectorMode}
      onLayout={onLayout} onCursor={vi.fn()}
    /></I18nProvider>);

    expect(screen.getByRole("button", { name: "3-column dashboard" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2+1" }));
    fireEvent.click(screen.getByRole("button", { name: "3 stacked" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose 3D acceleration" }));
    expect(onLayout.mock.calls.map(([layout]) => layout)).toEqual(["two-plus-one", "three-stacked"]);
    expect(onAccelerationVectorMode).toHaveBeenCalledWith("vector-3d");
    expect(document.querySelector(".segment-telemetry-grid")).toHaveAttribute("data-layout", "three-column");
  });

  it("drag-zooms every chart through one shared window and exposes a full-view reset", () => {
    render(<I18nProvider><SegmentTelemetryChart
      analysis={analysis()} visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
      synchronizedAccelerationByLap={accelerationByLap()} cursorDistanceMeters={50}
      layout="three-column" onLayout={vi.fn()} onCursor={vi.fn()}
    /></I18nProvider>);

    expect(screen.getAllByTestId("segment-chart").map((chart) => chart.getAttribute("data-interaction-mode")))
      .toEqual(["range", "range"]);
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Brush Speed" }));
    for (const title of ["Speed", "Delta-T"]) {
      expect(chartOption(title).dataZoom).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "inside", start: 25, end: 75 }),
      ]));
    }
    expect(screen.getAllByTestId("segment-chart").map((chart) => chart.getAttribute("data-cursor-x")))
      .toEqual(["50", "50"]);

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    for (const title of ["Speed", "Delta-T"]) {
      expect(chartOption(title).dataZoom).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "inside", start: 0, end: 100 }),
      ]));
    }
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
  });

  it("resets zoom atomically when the analysis scope changes and ignores a late prior-scope zoom event", () => {
    const initial = analysis();
    const view = render(<I18nProvider><SegmentTelemetryChart
      analysis={initial} visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
      synchronizedAccelerationByLap={accelerationByLap()} cursorDistanceMeters={50}
      layout="three-column" onLayout={vi.fn()} onCursor={vi.fn()}
    /></I18nProvider>);
    const priorScopeZoomHandler = chartPanelSpy.onZoomReferences[0];

    fireEvent.click(screen.getByRole("button", { name: "Zoom Speed" }));
    expect(chartOption("Speed").dataZoom).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "inside", start: 25, end: 70 }),
    ]));

    const changed = analysis();
    changed.scope = { kind: "section", sectionId: "c2" };
    changed.range = { startDistanceMeters: 1100, endDistanceMeters: 1300 };
    view.rerender(<I18nProvider><SegmentTelemetryChart
      analysis={changed} visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
      synchronizedAccelerationByLap={accelerationByLap()} cursorDistanceMeters={50}
      layout="three-column" onLayout={vi.fn()} onCursor={vi.fn()}
    /></I18nProvider>);

    for (const title of ["Speed", "Delta-T"]) {
      expect(chartOption(title).dataZoom).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "inside", start: 0, end: 100 }),
      ]));
    }

    act(() => priorScopeZoomHandler?.({ start: 40, end: 60 }));
    expect(chartOption("Speed").dataZoom).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "inside", start: 0, end: 100 }),
    ]));
  });

  it("keeps metric cards stable when acceleration or reference evidence is unavailable", () => {
    const first = render(<I18nProvider><SegmentTelemetryChart
      analysis={analysis()} visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
      layout="three-column" onLayout={vi.fn()} onCursor={vi.fn()}
    /></I18nProvider>);
    expect(screen.getByText("Measured acceleration unavailable")).toBeVisible();
    expect(screen.getAllByTestId("segment-chart")).toHaveLength(2);
    first.unmount();

    render(<I18nProvider><SegmentTelemetryChart
      analysis={analysis()} visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2" axis="distance" synchronizedAccelerationByLap={accelerationByLap()}
      layout="three-column" onLayout={vi.fn()} onCursor={vi.fn()}
    /></I18nProvider>);
    expect(screen.getByText("Select a reference lap to calculate Delta-T")).toBeVisible();
    expect(screen.getAllByTestId("segment-chart")).toHaveLength(2);
    expect(screen.getByText("Reference acceleration unavailable")).toBeVisible();
  });

  it("does not emit a cursor when the focused trajectory is empty", () => {
    const empty = analysis();
    empty.records.find((record) => record.lapId === "lap-2")!.trajectory = [];
    const onCursor = vi.fn();

    render(<I18nProvider><SegmentTelemetryChart
      analysis={empty} visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2" referenceLapId="lap-1" axis="distance"
      synchronizedAccelerationByLap={accelerationByLap()} layout="three-column"
      onLayout={vi.fn()} onCursor={onCursor}
    /></I18nProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Hover Speed" }));
    fireEvent.click(screen.getByRole("button", { name: "Point Speed" }));
    fireEvent.click(screen.getByRole("button", { name: "Next Speed" }));
    expect(onCursor).not.toHaveBeenCalled();
    expect(screen.getAllByText("Telemetry unavailable for this scope")).toHaveLength(2);
  });

  it("keeps the reference calculation but removes its plotted series in focused-only mode", () => {
    const option = buildSegmentTelemetryMetricOption(
      analysis(), ["lap-2"], "distance", "lap-2", "lap-1",
      labels(), "speed", undefined, { start: 0, end: 100 }, false,
    ) as {
      series: Array<{ id: string }>;
      legend: { data: string[] };
    };

    expect(option.series.map((series) => series.id)).toEqual(["lap-2-speed"]);
    expect(option.legend.data).toEqual(["Focused · Lap 2"]);
  });

  it("plots every requested presentation lap without the former five-lap ceiling", () => {
    const manyLaps = analysisWithLapCount(7);
    const visibleLapIds = manyLaps.records.map((record) => record.lapId);
    const option = buildSegmentTelemetryMetricOption(
      manyLaps,
      visibleLapIds,
      "distance",
      "lap-7",
      "lap-1",
      labels(),
      "speed",
      undefined,
      { start: 0, end: 100 },
      false,
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

  it("removes the duplicate keyboard range editor from the telemetry widget", () => {
    const fractional = analysis();
    fractional.range = { startDistanceMeters: 1000, endDistanceMeters: 1100.6 };
    render(<I18nProvider><SegmentTelemetryChart
      analysis={fractional}
      visibleLapIds={["lap-1", "lap-2"]}
      focusedLapId="lap-2"
      referenceLapId="lap-1"
      axis="distance"
      layout="three-column"
      onLayout={vi.fn()}
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

function accelerationByLap(focusedMethod: SynchronizedAccelerationSeries["method"] = "line-order"): Record<string, SynchronizedAccelerationSeries> {
  return {
    "lap-1": acceleration("timestamp"),
    "lap-2": acceleration(focusedMethod),
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

function chartOption(title: string): {
  xAxis: { min: number; max: number };
  series: Array<{ id: string; data: number[][] }>;
  dataZoom: Array<Record<string, unknown>>;
} {
  const chart = screen.getAllByTestId("segment-chart").find((candidate) => candidate.getAttribute("data-title") === title);
  if (!chart) throw new Error(`Missing ${title} chart`);
  return JSON.parse(chart.getAttribute("data-option")!);
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
