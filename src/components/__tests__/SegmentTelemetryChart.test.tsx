import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import type { SegmentAnalysisResult } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { buildSegmentTelemetryOption } from "../segmentTelemetryOptions";

vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ option, onBrushRange, actions }: { option: EChartsOption; onBrushRange?: (start: number, end: number) => void; actions?: unknown }) => (
    <div data-testid="segment-chart" data-option={JSON.stringify(option)}>
      {actions as ReactNode}
      <button type="button" onClick={() => onBrushRange?.(80, 20)}>Emit range</button>
    </div>
  ),
}));

import { SegmentTelemetryChart } from "../SegmentTelemetryChart";

describe("segment telemetry chart", () => {
  it("builds five linked grids for speed, GPS speed derivative, elapsed time, Delta-T, and loss rate", () => {
    const option = buildSegmentTelemetryOption(analysis(), ["lap-1", "lap-2"], "distance", "lap-2", "lap-1") as {
      grid: unknown[];
      series: Array<{ id: string; name: string; data: number[][] }>;
      legend: { data: string[] };
      dataZoom: Array<Record<string, unknown>>;
      axisPointer: { link: Array<Record<string, unknown>> };
    };

    expect(option.grid).toHaveLength(5);
    expect(option.series.filter((series) => series.name === "Lap 2")).toHaveLength(5);
    expect(option.series.map((series) => series.id)).toEqual(expect.arrayContaining([
      "lap-2-speed", "lap-2-acceleration", "lap-2-elapsed", "lap-2-delta", "lap-2-loss",
    ]));
    expect(option.legend.data).toEqual(["Lap 2", "Lap 1"]);
    expect(option.series.every((series) => series.data.every((point) => point.length === 3))).toBe(true);
    expect(option.dataZoom).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "inside", xAxisIndex: [0, 1, 2, 3, 4] }),
    ]));
    expect(option.axisPointer).toEqual(expect.objectContaining({ link: [{ xAxisIndex: "all" }] }));
  });

  it("switches to elapsed time on x and emits an ordered distance range", () => {
    const onRange = vi.fn();
    render(
      <I18nProvider>
        <SegmentTelemetryChart
          analysis={analysis()}
          overlayLapIds={["lap-1", "lap-2"]}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          axis="time"
          onRange={onRange}
          onReset={vi.fn()}
          onCursorDistance={vi.fn()}
        />
      </I18nProvider>,
    );

    const option = JSON.parse(screen.getByTestId("segment-chart").getAttribute("data-option")!);
    const speed = option.series.find((series: { id: string }) => series.id === "lap-2-speed");
    expect(speed.data[1][0]).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Emit range" }));
    expect(onRange).toHaveBeenCalledWith(1100, 1100);
  });
});

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
