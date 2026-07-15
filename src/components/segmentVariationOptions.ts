import type { EChartsOption, SeriesOption } from "echarts";
import type { SegmentAnalysisResult, SegmentLapRecord } from "../domain/types";

export interface SegmentVariationLabels {
  lap: string;
  segmentTime: string;
  drivenPath: string;
  focused: string;
  reference: string;
  average: string;
}

export function buildSegmentVariationOption(
  analysis: SegmentAnalysisResult,
  focusedLapId: string | undefined,
  referenceLapId: string | undefined,
  labels: SegmentVariationLabels,
): EChartsOption {
  const records = analysis.records.filter((record) =>
    record.eligibleForBest && record.durationSeconds !== undefined && record.drivenDistanceMeters !== undefined);
  const trend = records.map((record) => [record.ordinal, record.durationSeconds!, record.ordinal]);
  const scatter = records.map((record) => [record.drivenDistanceMeters!, record.durationSeconds!, record.ordinal]);
  const focused = records.find((record) => record.lapId === focusedLapId);
  const reference = records.find((record) => record.lapId === referenceLapId);

  return {
    animation: false,
    grid: [
      { left: 68, right: 24, top: 34, height: "34%" },
      { left: 68, right: 24, top: "58%", height: "30%" },
    ],
    xAxis: [
      { type: "value", gridIndex: 0, minInterval: 1, name: labels.lap, nameLocation: "middle", nameGap: 26 },
      { type: "value", gridIndex: 1, name: `${labels.drivenPath} (m)`, nameLocation: "middle", nameGap: 30, scale: true },
    ],
    yAxis: [
      { type: "value", gridIndex: 0, name: `${labels.segmentTime} (s)`, nameLocation: "middle", nameGap: 48, scale: true },
      { type: "value", gridIndex: 1, name: `${labels.segmentTime} (s)`, nameLocation: "middle", nameGap: 48, scale: true },
    ],
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => variationTooltip(params, labels),
    },
    legend: {
      data: [labels.focused, labels.reference],
      top: 0,
      right: 24,
    },
    series: [
      {
        id: "lap-time-trend",
        name: labels.segmentTime,
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: trend,
        symbolSize: 7,
        lineStyle: { color: "#0f766e", width: 2 },
        itemStyle: { color: "#0f766e" },
        markLine: {
          silent: true,
          symbol: "none",
          data: [{ type: "average", name: labels.average }],
          lineStyle: { color: "#94a3b8", type: "dashed" },
        },
      },
      {
        id: "path-time-scatter",
        name: `${labels.segmentTime} / ${labels.drivenPath}`,
        type: "scatter",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: scatter,
        symbolSize: 9,
        itemStyle: { color: "#0f766e", opacity: 0.74 },
      },
      ...highlightSeries(focused, labels.focused, "#dc2626"),
      ...(reference?.lapId === focused?.lapId ? [] : highlightSeries(reference, labels.reference, "#2563eb")),
    ],
  };
}

function highlightSeries(record: SegmentLapRecord | undefined, name: string, color: string): SeriesOption[] {
  if (!record || record.durationSeconds === undefined || record.drivenDistanceMeters === undefined) return [];
  return [
    {
      id: `${record.lapId}-trend-highlight`,
      name,
      type: "scatter",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: [[record.ordinal, record.durationSeconds, record.ordinal]],
      symbolSize: 14,
      itemStyle: { color, borderColor: "#ffffff", borderWidth: 2 },
      z: 5,
    },
    {
      id: `${record.lapId}-scatter-highlight`,
      name,
      type: "scatter",
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: [[record.drivenDistanceMeters, record.durationSeconds, record.ordinal]],
      symbolSize: 14,
      itemStyle: { color, borderColor: "#ffffff", borderWidth: 2 },
      z: 5,
    },
  ];
}

function variationTooltip(value: unknown, labels: SegmentVariationLabels): string {
  const params = value as { value?: unknown };
  if (!Array.isArray(params?.value)) return "";
  const [x, duration, ordinal] = params.value;
  if (![x, duration, ordinal].every((item) => typeof item === "number")) return "";
  return `${labels.lap} ${ordinal}<br/>${labels.segmentTime}: ${Number(duration).toFixed(3)} s`;
}
