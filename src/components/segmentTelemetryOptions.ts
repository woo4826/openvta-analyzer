import type { EChartsOption, LineSeriesOption } from "echarts";
import type {
  SegmentAnalysisResult,
  SegmentLapRecord,
  SynchronizedAccelerationSeries,
} from "../domain/types";
import type { SegmentAxis } from "../app/useSegmentWorkbench";

export const FOCUSED_LAP_COLOR = "#dc2626";
export const REFERENCE_LAP_COLOR = "#2563eb";
const EXTRA_COLORS = ["#16a34a", "#7c3aed", "#ea580c"];
export type CoreSegmentTelemetryMetric = "speed" | "delta";

export interface SegmentTelemetryZoomWindow {
  start: number;
  end: number;
}

export type SegmentAccelerationSeriesByLap = Readonly<Record<string, SynchronizedAccelerationSeries | undefined>>;

export interface SegmentTelemetryLabels {
  speed: string;
  imuAcceleration: string;
  imuAxisX: string;
  imuAxisY: string;
  imuAxisZ: string;
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

export function buildSegmentTelemetryMetricOption(
  analysis: SegmentAnalysisResult,
  visibleLapIds: string[],
  axis: SegmentAxis,
  focusedLapId: string | undefined,
  referenceLapId: string | undefined,
  labels: SegmentTelemetryLabels,
  metric: CoreSegmentTelemetryMetric,
  synchronizedAccelerationByLap: SegmentAccelerationSeriesByLap | undefined,
  zoomWindow: SegmentTelemetryZoomWindow,
  showZoomSlider: boolean,
): EChartsOption {
  const visibleIds = unique([
    visibleLapIds.includes(focusedLapId ?? "") ? focusedLapId : undefined,
    visibleLapIds.includes(referenceLapId ?? "") ? referenceLapId : undefined,
    ...visibleLapIds,
  ]);
  const records = visibleIds.flatMap((id) => {
    const record = analysis.records.find((candidate) => candidate.lapId === id);
    return record ? [record] : [];
  });
  const metricRecords = records;
  const commonDomainMaximum = segmentTelemetryDomainMaximum(records, axis, synchronizedAccelerationByLap);
  const metricLabel = metric === "speed" ? labels.speed : labels.delta;
  const metricUnit = metric === "speed" ? "km/h" : "s";
  const maximumDeltaSample = analysis.records
    .find((record) => record.lapId === focusedLapId)?.trajectory
    .filter((sample) => Number.isFinite(sample.deltaSeconds))
    .sort((left, right) => right.deltaSeconds - left.deltaSeconds)[0];
  const maximumDeltaX = maximumDeltaSample
    ? axis === "distance" ? maximumDeltaSample.distanceMeters : maximumDeltaSample.elapsedSeconds
    : undefined;
  const series: LineSeriesOption[] = metricRecords.map((record, recordIndex) => {
    const color = lapColor(record.lapId, recordIndex, focusedLapId, referenceLapId);
    const name = lapSeriesName(record, focusedLapId, referenceLapId, labels);
    const markLines: Array<Record<string, unknown>> = [];
    if (record.lapId === focusedLapId && maximumDeltaX !== undefined) {
      markLines.push({
        xAxis: maximumDeltaX,
        label: { show: metric === "speed", formatter: labels.maximumDelta, color: "#991b1b" },
        lineStyle: { color: "#f59e0b", type: "dashed", width: 1.5 },
      });
    }
    if (metric === "delta") {
      markLines.push({ yAxis: 0, label: { show: false }, lineStyle: { color: "#94a3b8", width: 1 } });
    }
    return {
      id: `${record.lapId}-${metric}`,
      name,
      type: "line",
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
      data: metricData(record, metric, axis),
      markLine: markLines.length ? { silent: true, symbol: "none", data: markLines } : undefined,
      emphasis: { focus: "series" },
    };
  });

  const legendData = metricRecords.map((record) => lapSeriesName(record, focusedLapId, referenceLapId, labels));
  const dataZoom = [
    {
      type: "inside" as const,
      filterMode: "none" as const,
      start: zoomWindow.start,
      end: zoomWindow.end,
      zoomOnMouseWheel: true,
      moveOnMouseMove: false,
      moveOnMouseWheel: false,
    },
    ...(showZoomSlider ? [{
      type: "slider" as const,
      filterMode: "none" as const,
      bottom: 0,
      height: 18,
      start: zoomWindow.start,
      end: zoomWindow.end,
    }] : []),
  ];

  return {
    animation: false,
    color: metricRecords.map((record, index) => lapColor(record.lapId, index, focusedLapId, referenceLapId)),
    grid: { left: 92, right: 24, top: 42, bottom: showZoomSlider ? 54 : 42, containLabel: false },
    xAxis: {
      type: "value",
      name: axis === "distance" ? labels.distanceAxis : labels.timeAxis,
      nameLocation: "middle",
      nameGap: 28,
      axisLabel: { color: "#64748b" },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      min: 0,
      max: commonDomainMaximum > 0 ? commonDomainMaximum : undefined,
    },
    yAxis: {
      type: "value",
      name: `${metricLabel}\n${metricUnit}`,
      nameLocation: "middle",
      nameGap: 58,
      nameTextStyle: { color: "#334155", fontWeight: 700, lineHeight: 15, align: "center" },
      axisLabel: { color: "#64748b", formatter: (value: number) => Number(value).toFixed(metric === "speed" ? 0 : 1) },
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
    },
    series,
    legend: { type: "scroll", top: 0, right: 24, data: legendData, selectedMode: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(3) : String(value ?? "—"),
    },
    brush: {
      xAxisIndex: "all",
      brushMode: "single",
      transformable: false,
      brushStyle: { borderWidth: 1, color: "rgba(15, 118, 110, 0.16)", borderColor: "#0f766e" },
    },
    dataZoom,
  };
}

export function segmentTelemetryDomainMaximum(
  records: SegmentLapRecord[],
  axis: SegmentAxis,
  synchronizedAccelerationByLap?: SegmentAccelerationSeriesByLap,
): number {
  return Math.max(
    0,
    ...records.flatMap((record) => record.trajectory.map((sample) => axis === "distance" ? sample.distanceMeters : sample.elapsedSeconds)),
    ...Object.values(synchronizedAccelerationByLap ?? {}).flatMap((series) =>
      series?.samples.map((sample) => axis === "distance" ? sample.distanceMeters : sample.elapsedSeconds) ?? []),
  );
}

function metricData(
  record: SegmentLapRecord,
  metric: CoreSegmentTelemetryMetric,
  axis: SegmentAxis,
): Array<[number, number | null, number]> {
  return record.trajectory.map((sample) => {
    const x = axis === "distance" ? sample.distanceMeters : sample.elapsedSeconds;
    const value = metric === "speed" ? sample.speedKmh : sample.deltaSeconds;
    return [x, value, sample.sourceIndex];
  });
}

function lapColor(lapId: string, extraIndex: number, focusedLapId?: string, referenceLapId?: string): string {
  if (lapId === focusedLapId) return FOCUSED_LAP_COLOR;
  if (lapId === referenceLapId) return REFERENCE_LAP_COLOR;
  return EXTRA_COLORS[extraIndex % EXTRA_COLORS.length];
}

function lapSeriesName(
  record: SegmentLapRecord,
  focusedLapId: string | undefined,
  referenceLapId: string | undefined,
  labels: SegmentTelemetryLabels,
): string {
  if (record.lapId === focusedLapId) return `${labels.focusedLap} · ${labels.lap} ${record.ordinal}`;
  if (record.lapId === referenceLapId) return `${labels.referenceLap} · ${labels.lap} ${record.ordinal}`;
  return `${labels.lap} ${record.ordinal}`;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
