import type { EChartsOption, LineSeriesOption } from "echarts";
import type { SegmentAnalysisResult, SegmentLapRecord } from "../domain/types";
import type { SegmentAxis } from "../app/useSegmentWorkbench";

const COLORS = ["#2563eb", "#ef4444", "#16a34a", "#7c3aed", "#ea580c"];
const GRAVITY_MPS2 = 9.80665;
type MetricKey = "speed" | "acceleration" | "elapsed" | "delta" | "loss";

export interface SegmentTelemetryLabels {
  speed: string;
  acceleration: string;
  elapsed: string;
  delta: string;
  loss: string;
  distanceAxis: string;
  timeAxis: string;
  lap: string;
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
};

export function buildSegmentTelemetryOption(
  analysis: SegmentAnalysisResult,
  overlayLapIds: string[],
  axis: SegmentAxis,
  focusedLapId?: string,
  referenceLapId?: string,
  labels: SegmentTelemetryLabels = DEFAULT_LABELS,
): EChartsOption {
  const metrics: Array<{ key: MetricKey; label: string; unit: string }> = [
    { key: "speed", label: labels.speed, unit: "km/h" },
    { key: "acceleration", label: labels.acceleration, unit: "g (GPS)" },
    { key: "elapsed", label: labels.elapsed, unit: "s" },
    { key: "delta", label: labels.delta, unit: "s" },
    { key: "loss", label: labels.loss, unit: "s/100m" },
  ];
  const visibleIds = unique([focusedLapId, referenceLapId, ...overlayLapIds]).slice(0, 5);
  const records = visibleIds.flatMap((id) => {
    const record = analysis.records.find((candidate) => candidate.lapId === id);
    return record ? [record] : [];
  });
  const grids = metrics.map((_, index) => ({
    left: 72,
    right: 24,
    top: `${4 + index * 18.5}%`,
    height: "13.5%",
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
    nameGap: 48,
    nameTextStyle: { color: "#334155", fontWeight: 700, lineHeight: 15 },
    axisLabel: { color: "#64748b", formatter: (value: number) => Number(value).toFixed(metric.key === "speed" ? 0 : 1) },
    splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" as const } },
  }));
  const series = records.flatMap((record, recordIndex) => metrics.map((metric, metricIndex): LineSeriesOption => ({
    id: `${record.lapId}-${metric.key}`,
    name: `${labels.lap} ${record.ordinal}`,
    type: "line",
    xAxisIndex: metricIndex,
    yAxisIndex: metricIndex,
    showSymbol: false,
    symbolSize: 5,
    connectNulls: false,
    lineStyle: {
      color: COLORS[recordIndex % COLORS.length],
      width: record.lapId === focusedLapId ? 3 : record.lapId === referenceLapId ? 2.5 : 1.5,
      type: record.lapId === referenceLapId && record.lapId !== focusedLapId ? "dashed" : "solid",
      opacity: record.lapId === focusedLapId || record.lapId === referenceLapId ? 1 : 0.72,
    },
    itemStyle: { color: COLORS[recordIndex % COLORS.length] },
    data: metricData(record, metric.key, axis),
    markLine: metric.key === "acceleration" || metric.key === "delta" || metric.key === "loss" ? {
      silent: true,
      symbol: "none",
      lineStyle: { color: "#94a3b8", width: 1 },
      data: [{ yAxis: 0 }],
      label: { show: false },
    } : undefined,
    emphasis: { focus: "series" },
  })));

  return {
    animation: false,
    color: COLORS,
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    series,
    legend: {
      type: "scroll",
      top: 0,
      right: 24,
      data: records.map((record) => `${labels.lap} ${record.ordinal}`),
      selectedMode: true,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(3) : String(value ?? "—"),
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1, 2, 3, 4], filterMode: "none" },
      { type: "slider", xAxisIndex: [0, 1, 2, 3, 4], bottom: 0, height: 18, filterMode: "none" },
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
  metric: MetricKey,
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
