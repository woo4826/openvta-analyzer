import type { EChartsOption, LineSeriesOption } from "echarts";
import type { SegmentAnalysisResult, SegmentLapRecord } from "../domain/types";
import type { SegmentAxis } from "../app/useSegmentWorkbench";

export const FOCUSED_LAP_COLOR = "#dc2626";
export const REFERENCE_LAP_COLOR = "#2563eb";
const EXTRA_COLORS = ["#16a34a", "#7c3aed", "#ea580c"];
const GRAVITY_MPS2 = 9.80665;
export type SegmentTelemetryMetric = "speed" | "acceleration" | "elapsed" | "delta" | "loss";

export interface SegmentTelemetryLabels {
  speed: string;
  acceleration: string;
  elapsed: string;
  delta: string;
  loss: string;
  distanceAxis: string;
  timeAxis: string;
  lap: string;
  focusedLap: string;
  referenceLap: string;
  maximumDelta: string;
}

const DEFAULT_LABELS: SegmentTelemetryLabels = {
  speed: "Speed",
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

export function buildSegmentTelemetryOption(
  analysis: SegmentAnalysisResult,
  overlayLapIds: string[],
  axis: SegmentAxis,
  focusedLapId?: string,
  referenceLapId?: string,
  labels: SegmentTelemetryLabels = DEFAULT_LABELS,
  visibleMetrics: SegmentTelemetryMetric[] = ["speed", "acceleration", "elapsed", "delta", "loss"],
): EChartsOption {
  const allMetrics: Array<{ key: SegmentTelemetryMetric; label: string; unit: string }> = [
    { key: "speed", label: labels.speed, unit: "km/h" },
    { key: "acceleration", label: labels.acceleration, unit: "g (GPS)" },
    { key: "elapsed", label: labels.elapsed, unit: "s" },
    { key: "delta", label: labels.delta, unit: "s" },
    { key: "loss", label: labels.loss, unit: "s/100m" },
  ];
  const metrics = allMetrics.filter((metric) => visibleMetrics.includes(metric.key));
  const visibleIds = unique([focusedLapId, referenceLapId, ...overlayLapIds]).slice(0, 5);
  const records = visibleIds.flatMap((id) => {
    const record = analysis.records.find((candidate) => candidate.lapId === id);
    return record ? [record] : [];
  });
  const gridCount = Math.max(metrics.length, 1);
  const gridTopPercent = 7;
  const gridBottomPercent = 84;
  const gridGapPercent = 2;
  const gridHeightPercent = (gridBottomPercent - gridTopPercent - gridGapPercent * (gridCount - 1)) / gridCount;
  const grids = metrics.map((_, index) => ({
    left: 92,
    right: 24,
    top: `${gridTopPercent + index * (gridHeightPercent + gridGapPercent)}%`,
    height: `${gridHeightPercent}%`,
    containLabel: false,
  }));
  const xAxes = metrics.map((_, index) => ({
    type: "value" as const,
    gridIndex: index,
    name: index === metrics.length - 1 ? axis === "distance" ? labels.distanceAxis : labels.timeAxis : "",
    nameLocation: "middle" as const,
    nameGap: 28,
    axisLabel: { show: index === metrics.length - 1, color: "#64748b" },
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" as const } },
    min: axis === "distance" ? 0 : undefined,
  }));
  const yAxes = metrics.map((metric, index) => ({
    type: "value" as const,
    gridIndex: index,
    name: `${metric.label}\n${metric.unit}`,
    nameLocation: "middle" as const,
    nameGap: 58,
    nameTextStyle: { color: "#334155", fontWeight: 700, lineHeight: 15, align: "center" as const },
    axisLabel: { color: "#64748b", formatter: (value: number) => Number(value).toFixed(metric.key === "speed" ? 0 : 1) },
    splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" as const } },
  }));
  const maximumDeltaSample = analysis.records
    .find((record) => record.lapId === focusedLapId)?.trajectory
    .filter((sample) => Number.isFinite(sample.deltaSeconds))
    .sort((left, right) => right.deltaSeconds - left.deltaSeconds)[0];
  const maximumDeltaX = maximumDeltaSample
    ? axis === "distance" ? maximumDeltaSample.distanceMeters : maximumDeltaSample.elapsedSeconds
    : undefined;
  const series = records.flatMap((record, recordIndex) => metrics.map((metric, metricIndex): LineSeriesOption => {
    const color = lapColor(record.lapId, recordIndex, focusedLapId, referenceLapId);
    const name = record.lapId === focusedLapId
      ? `${labels.focusedLap} · ${labels.lap} ${record.ordinal}`
      : record.lapId === referenceLapId
        ? `${labels.referenceLap} · ${labels.lap} ${record.ordinal}`
        : `${labels.lap} ${record.ordinal}`;
    const markLines: Array<Record<string, unknown>> = [];
    if (record.lapId === focusedLapId && maximumDeltaX !== undefined) {
      markLines.push({
        xAxis: maximumDeltaX,
        label: { show: metricIndex === 0, formatter: labels.maximumDelta, color: "#991b1b" },
        lineStyle: { color: "#f59e0b", type: "dashed", width: 1.5 },
      });
    }
    if (metric.key === "acceleration" || metric.key === "delta" || metric.key === "loss") {
      markLines.push({ yAxis: 0, label: { show: false }, lineStyle: { color: "#94a3b8", width: 1 } });
    }
    return ({
    id: `${record.lapId}-${metric.key}`,
    name,
    type: "line",
    xAxisIndex: metricIndex,
    yAxisIndex: metricIndex,
    showSymbol: false,
    symbolSize: 5,
    connectNulls: false,
    lineStyle: {
      color,
      width: record.lapId === focusedLapId ? 3 : record.lapId === referenceLapId ? 2.5 : 1.5,
      type: record.lapId === referenceLapId && record.lapId !== focusedLapId ? "dashed" : "solid",
      opacity: record.lapId === focusedLapId || record.lapId === referenceLapId ? 1 : 0.72,
    },
    itemStyle: { color },
    data: metricData(record, metric.key, axis),
    markLine: markLines.length ? {
      silent: true,
      symbol: "none",
      data: markLines,
    } : undefined,
    emphasis: { focus: "series" },
    });
  }));

  const xAxisIndexes = metrics.map((_, index) => index);

  return {
    animation: false,
    color: records.map((record, index) => lapColor(record.lapId, index, focusedLapId, referenceLapId)),
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    series,
    legend: {
      type: "scroll",
      top: 0,
      right: 24,
      data: records.map((record) => record.lapId === focusedLapId
        ? `${labels.focusedLap} · ${labels.lap} ${record.ordinal}`
        : record.lapId === referenceLapId
          ? `${labels.referenceLap} · ${labels.lap} ${record.ordinal}`
          : `${labels.lap} ${record.ordinal}`),
      selectedMode: true,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(3) : String(value ?? "—"),
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    dataZoom: [
      { type: "inside", xAxisIndex: xAxisIndexes, filterMode: "none" },
      { type: "slider", xAxisIndex: xAxisIndexes, bottom: 0, height: 18, filterMode: "none" },
    ],
    brush: {
      toolbox: ["lineX", "clear"],
      xAxisIndex: "all",
      brushMode: "single",
      throttleType: "debounce",
      throttleDelay: 120,
    },
  };
}

function metricData(
  record: SegmentLapRecord,
  metric: SegmentTelemetryMetric,
  axis: SegmentAxis,
): Array<[number, number | null, number]> {
  return record.trajectory.map((sample, index) => {
    const x = axis === "distance" ? sample.distanceMeters : sample.elapsedSeconds;
    const value = metric === "speed"
      ? sample.speedKmh
      : metric === "acceleration"
        ? longitudinalAccelerationG(record, index)
        : metric === "elapsed"
        ? sample.elapsedSeconds
        : metric === "delta"
          ? sample.deltaSeconds
          : sample.lossRateSecondsPer100m ?? null;
    return [x, value, sample.sourceIndex];
  });
}

function lapColor(lapId: string, extraIndex: number, focusedLapId?: string, referenceLapId?: string): string {
  if (lapId === focusedLapId) return FOCUSED_LAP_COLOR;
  if (lapId === referenceLapId) return REFERENCE_LAP_COLOR;
  return EXTRA_COLORS[extraIndex % EXTRA_COLORS.length];
}

function longitudinalAccelerationG(record: SegmentLapRecord, index: number): number | null {
  if (index === 0) return null;
  const previous = record.trajectory[index - 1];
  const sample = record.trajectory[index];
  const elapsed = sample.elapsedSeconds - previous.elapsedSeconds;
  if (elapsed <= 0) return null;
  return ((sample.speedKmh - previous.speedKmh) / 3.6) / elapsed / GRAVITY_MPS2;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
