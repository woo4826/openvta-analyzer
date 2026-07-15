import type { EChartsOption } from "echarts";
import { GRAVITY_MPS2 } from "../domain/types";
import type { LapComparisonSample } from "../domain/types";
import type { Translate } from "../i18n/messages";

export type TelemetryAxis = "time" | "distance";

export function buildLapTelemetryOption(
  samples: LapComparisonSample[],
  axis: TelemetryAxis,
  showDelta: boolean,
  selectedPointIndex: number,
  t: Translate,
): EChartsOption {
  const xAxisIndexes = showDelta ? [0, 1, 2] : [0, 1];
  const xName = axis === "time" ? t("lap.telemetry.elapsedSeconds") : t("lap.telemetry.distanceMeters");
  const xValue = (sample: LapComparisonSample) => axis === "time" ? sample.elapsedSeconds : sample.distanceMeters;
  const selected = samples.find((sample) => sample.sourceIndex === selectedPointIndex);
  const selectedX = selected ? xValue(selected) : undefined;
  const speed = samples.map((sample) => [xValue(sample), sample.speedKmh, sample.sourceIndex]);
  const acceleration = samples.map((sample, index) => {
    const previous = samples[index - 1];
    const elapsedSeconds = previous ? sample.elapsedSeconds - previous.elapsedSeconds : 0;
    const accelerationG = previous && elapsedSeconds > 0
      ? ((sample.speedKmh - previous.speedKmh) / 3.6) / elapsedSeconds / GRAVITY_MPS2
      : 0;
    return [xValue(sample), accelerationG, sample.sourceIndex];
  });
  const delta = samples.map((sample) => [xValue(sample), sample.deltaSeconds, sample.sourceIndex]);
  const marker = selectedX === undefined ? undefined : {
    symbol: "none" as const,
    silent: true,
    lineStyle: { color: "#17242d", type: "dashed" as const, opacity: 0.55 },
    data: [{ xAxis: selectedX }],
  };
  const grids = showDelta
    ? [
        { left: 58, right: 24, top: 50, height: 118 },
        { left: 58, right: 24, top: 205, height: 94 },
        { left: 58, right: 24, top: 335, height: 82 },
      ]
    : [
        { left: 58, right: 24, top: 50, height: 145 },
        { left: 58, right: 24, top: 240, height: 125 },
      ];
  const xAxes = xAxisIndexes.map((gridIndex, index) => ({
    type: "value" as const,
    gridIndex,
    name: xName,
    nameLocation: "middle" as const,
    nameGap: index === xAxisIndexes.length - 1 ? 28 : 22,
    axisLabel: { show: index === xAxisIndexes.length - 1 },
    axisPointer: { show: true, snap: false },
  }));
  const yAxes = [
    { type: "value" as const, gridIndex: 0, name: "km/h", scale: true },
    { type: "value" as const, gridIndex: 1, name: "g", scale: true },
    ...(showDelta ? [{ type: "value" as const, gridIndex: 2, name: "s", scale: true }] : []),
  ];
  const series = [
    telemetrySeries(t("lap.telemetry.speed"), speed, 0, "#0f766e", marker),
    telemetrySeries(t("lap.telemetry.acceleration"), acceleration, 1, "#d97706", marker),
    ...(showDelta ? [telemetrySeries(t("lap.telemetry.delta"), delta, 2, "#be3b3b", marker, "area")] : []),
  ];

  return {
    animation: false,
    color: ["#0f766e", "#d97706", "#be3b3b"],
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    legend: { top: 4, left: 58 },
    toolbox: {
      right: 12,
      top: 2,
      feature: {
        dataZoom: { yAxisIndex: "none" },
        brush: { type: ["lineX", "clear"] },
        restore: {},
      },
    },
    brush: {
      xAxisIndex: xAxisIndexes,
      brushMode: "single",
      throttleType: "debounce",
      throttleDelay: 120,
    },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    dataZoom: [
      { type: "inside", xAxisIndex: xAxisIndexes, filterMode: "none" },
      { type: "slider", xAxisIndex: xAxisIndexes, filterMode: "none", height: 20, bottom: 6 },
    ],
    series,
  };
}

function telemetrySeries(
  name: string,
  data: number[][],
  axisIndex: number,
  color: string,
  markLine: object | undefined,
  fill?: "area",
) {
  return {
    type: "line" as const,
    name,
    data,
    xAxisIndex: axisIndex,
    yAxisIndex: axisIndex,
    encode: { x: 0, y: 1 },
    showSymbol: false,
    sampling: "lttb" as const,
    lineStyle: { width: 2, color },
    areaStyle: fill ? { color, opacity: 0.08 } : undefined,
    markLine,
  };
}
