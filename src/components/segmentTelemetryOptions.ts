import type { EChartsOption, LineSeriesOption } from "echarts";
import type { SegmentAnalysisResult, SegmentLapRecord } from "../domain/types";
import type { SegmentAxis } from "../app/useSegmentWorkbench";

const COLORS = ["#2563eb", "#ef4444", "#16a34a", "#7c3aed", "#ea580c"];
const METRICS = [
  { key: "speed", label: "Speed", unit: "km/h" },
  { key: "elapsed", label: "Elapsed time", unit: "s" },
  { key: "delta", label: "Delta-T", unit: "s" },
  { key: "loss", label: "Loss rate", unit: "s/100m" },
] as const;

export function buildSegmentTelemetryOption(
  analysis: SegmentAnalysisResult,
  overlayLapIds: string[],
  axis: SegmentAxis,
  focusedLapId?: string,
  referenceLapId?: string,
): EChartsOption {
  const visibleIds = unique([focusedLapId, referenceLapId, ...overlayLapIds]).slice(0, 5);
  const records = visibleIds.flatMap((id) => {
    const record = analysis.records.find((candidate) => candidate.lapId === id);
    return record ? [record] : [];
  });
  const grids = METRICS.map((_, index) => ({
    left: 72,
    right: 24,
    top: `${4 + index * 24}%`,
    height: "17%",
    containLabel: false,
  }));
  const xAxes = METRICS.map((_, index) => ({
    type: "value" as const,
    gridIndex: index,
    name: index === METRICS.length - 1 ? axis === "distance" ? "Distance (m)" : "Elapsed time (s)" : "",
    nameLocation: "middle" as const,
    nameGap: 28,
    axisLabel: { show: index === METRICS.length - 1, color: "#64748b" },
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" as const } },
    min: axis === "distance" ? 0 : undefined,
  }));
  const yAxes = METRICS.map((metric, index) => ({
    type: "value" as const,
    gridIndex: index,
    name: `${metric.label}\n${metric.unit}`,
    nameLocation: "middle" as const,
    nameGap: 48,
    nameTextStyle: { color: "#334155", fontWeight: 700, lineHeight: 15 },
    axisLabel: { color: "#64748b", formatter: (value: number) => Number(value).toFixed(metric.key === "speed" ? 0 : 1) },
    splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" as const } },
  }));
  const series = records.flatMap((record, recordIndex) => METRICS.map((metric, metricIndex): LineSeriesOption => ({
    id: `${record.lapId}-${metric.key}`,
    name: `Lap ${record.ordinal} ${metric.label}`,
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
    markLine: metric.key === "delta" || metric.key === "loss" ? {
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
      selectedMode: true,
      formatter: (name: string) => name.replace(/ (Speed|Elapsed time|Delta-T|Loss rate)$/, ""),
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(3) : String(value ?? "—"),
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1, 2, 3], filterMode: "none" },
      { type: "slider", xAxisIndex: [0, 1, 2, 3], bottom: 0, height: 18, filterMode: "none" },
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
  metric: typeof METRICS[number]["key"],
  axis: SegmentAxis,
): Array<[number, number | null, number]> {
  return record.trajectory.map((sample) => {
    const x = axis === "distance" ? sample.distanceMeters : sample.elapsedSeconds;
    const value = metric === "speed"
      ? sample.speedKmh
      : metric === "elapsed"
        ? sample.elapsedSeconds
        : metric === "delta"
          ? sample.deltaSeconds
          : sample.lossRateSecondsPer100m ?? null;
    return [x, value, sample.sourceIndex];
  });
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
