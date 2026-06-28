import { useCallback, useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { ActiveSegment, GpsPoint, SensorPoint, TransformMode, VtaFile } from "../domain/types";
import { GRAVITY_MPS2 } from "../domain/types";
import { buildValidationRows, routeDistanceSeries, summarizePointRange } from "../domain/analysis";
import { displayGpsPoints } from "../domain/statistics";
import { useI18n } from "../i18n/useI18n";
import { ChartPanel } from "./ChartPanel";
import { Metric, Panel, StatusBadge } from "./ui";

interface ChartsProps {
  file: VtaFile;
  sensors: SensorPoint[];
  accelerationSensorSets?: AccelerationSensorSet[];
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  activeSegment?: ActiveSegment;
  onActiveSegment?: (segment?: ActiveSegment) => void;
  transformMode?: TransformMode;
  visiblePoints?: GpsPoint[];
}

export interface AccelerationSensorSet {
  label: string;
  sensors: SensorPoint[];
}

export function Charts({
  file,
  sensors,
  accelerationSensorSets,
  selectedPointIndex,
  onSelectedPointIndex,
  activeSegment,
  onActiveSegment,
  transformMode = "raw",
  visiblePoints,
}: ChartsProps) {
  const { t } = useI18n();
  const points = useMemo(() => visiblePoints ?? displayGpsPoints(file), [file, visiblePoints]);
  const chartTitles = useMemo(
    () => ({
      velocity: t("charts.velocity"),
      distance: t("charts.distanceOverTime"),
      derivedAcceleration: t("charts.velocityDerivedAcceleration"),
      altitude: t("charts.altitude"),
      accuracy: t("charts.gpsAccuracy"),
      acceleration: t("charts.acceleration"),
      velocityAcceleration: t("charts.velocityAcceleration"),
      pitchRollYaw: t("charts.pitchRollYaw"),
      frictionCircle: t("charts.frictionCircle"),
    }),
    [t],
  );
  const chartLabels = useMemo(
    () => ({
      acceleration: t("charts.acceleration"),
      accuracy: t("charts.series.accuracy"),
      altitude: t("charts.series.altitude"),
      derivedAcceleration: t("charts.series.derivedAcceleration"),
      distance: t("charts.series.distance"),
      elapsedSeconds: t("charts.axis.elapsedSeconds"),
      friction: t("charts.series.friction"),
      lateralG: t("charts.axis.lateralG"),
      longitudinalG: t("charts.axis.longitudinalG"),
      pitchRollX: t("charts.series.pitchRollX"),
      pitchRollY: t("charts.series.pitchRollY"),
      pointIndex: t("charts.axis.pointIndex"),
      velocity: t("charts.series.velocity"),
      yawZ: t("charts.series.yawZ"),
    }),
    [t],
  );
  const velocity = useMemo(() => points.map((point, index) => [index, point.speedKmh]), [points]);
  const altitude = useMemo(() => points.map((point, index) => [index, point.altitudeMeters]), [points]);
  const accuracy = useMemo(
    () =>
      points
        .map((point, index) => (point.accuracyMeters === undefined ? undefined : [index, point.accuracyMeters]))
        .filter((value): value is number[] => value !== undefined),
    [points],
  );
  const distanceRows = useMemo(() => routeDistanceSeries(points), [points]);
  const distance = useMemo(() => distanceRows.map((row) => [row.elapsedSeconds, row.distanceKm]), [distanceRows]);
  const validationRows = useMemo(() => buildValidationRows(points), [points]);
  const velocityDerivedAcceleration = useMemo(
    () => validationRows.map((row) => [row.elapsedSeconds, row.derivedAccelMps2]),
    [validationRows],
  );
  const activeAccelerationSensorSets = useMemo(
    () =>
      transformMode === "compare" && accelerationSensorSets?.length
        ? localizeAccelerationSensorSets(accelerationSensorSets, t)
        : [{ label: transformSeriesLabel(transformMode, t), sensors }],
    [accelerationSensorSets, sensors, t, transformMode],
  );
  const orientation = useMemo(
    () =>
      sensors
        .filter((sensor) => sensor.orientationXDegrees !== undefined || sensor.orientationYDegrees !== undefined)
        .map((sensor) => [
          sensor.elapsedSeconds,
          sensor.orientationXDegrees ?? 0,
          sensor.orientationYDegrees ?? 0,
          sensor.orientationZDegrees ?? 0,
        ]),
    [sensors],
  );
  const friction = useMemo(() => sensors.map((sensor) => [toG(sensor, sensor.accelY), toG(sensor, sensor.accelX)]), [sensors]);

  const baseAxis = useMemo(() => (selectedPointIndex >= 0 ? [{ xAxis: selectedPointIndex }] : []), [selectedPointIndex]);
  const selectedDistanceTime = distanceRows[selectedPointIndex]?.elapsedSeconds;
  const selectedValidationTime = selectedPointIndex > 0 ? validationRows[selectedPointIndex - 1]?.elapsedSeconds : undefined;
  const distanceAxis = useMemo(
    () => (selectedDistanceTime === undefined ? [] : [{ xAxis: selectedDistanceTime }]),
    [selectedDistanceTime],
  );
  const validationAxis = useMemo(
    () => (selectedValidationTime === undefined ? [] : [{ xAxis: selectedValidationTime }]),
    [selectedValidationTime],
  );
  const summary = useMemo(() => summarizePointRange(points, activeSegment), [points, activeSegment]);

  const selectPoint = useCallback(
    (index: number) => {
      if (!points.length) {
        return;
      }
      const nextIndex = clampIndex(index, points.length);
      if (nextIndex === selectedPointIndex) {
        return;
      }
      onSelectedPointIndex(nextIndex);
    },
    [onSelectedPointIndex, points.length, selectedPointIndex],
  );

  const selectBrushSegment = useCallback(
    (startIndex: number, endIndex: number) => {
      if (!points.length) {
        return;
      }
      const start = clampIndex(startIndex, points.length);
      const end = clampIndex(endIndex, points.length);
      const nextSegment = { startIndex: Math.min(start, end), endIndex: Math.max(start, end), source: "chart" as const };
      if (activeSegment?.startIndex === nextSegment.startIndex && activeSegment.endIndex === nextSegment.endIndex) {
        return;
      }
      onActiveSegment?.(nextSegment);
    },
    [activeSegment?.endIndex, activeSegment?.startIndex, onActiveSegment, points.length],
  );

  const selectVisibleVelocityRange = useCallback(() => {
    if (!points.length) {
      return;
    }
    const nextSegment = { startIndex: 0, endIndex: points.length - 1, source: "chart" as const };
    if (activeSegment?.startIndex === nextSegment.startIndex && activeSegment.endIndex === nextSegment.endIndex) {
      return;
    }
    onActiveSegment?.(nextSegment);
  }, [activeSegment?.endIndex, activeSegment?.startIndex, onActiveSegment, points.length]);

  const velocityOption = useMemo(
    () => lineOption(chartLabels.pointIndex, "km/h", [{ name: chartLabels.velocity, data: velocity }], baseAxis, true),
    [baseAxis, chartLabels.pointIndex, chartLabels.velocity, velocity],
  );
  const distanceOption = useMemo(
    () => lineOption(chartLabels.elapsedSeconds, "km", [{ name: chartLabels.distance, data: distance }], distanceAxis),
    [chartLabels.distance, chartLabels.elapsedSeconds, distance, distanceAxis],
  );
  const derivedAccelerationOption = useMemo(
    () =>
      lineOption(
        chartLabels.elapsedSeconds,
        "m/s^2",
        [{ name: chartLabels.derivedAcceleration, data: velocityDerivedAcceleration }],
        validationAxis,
      ),
    [chartLabels.derivedAcceleration, chartLabels.elapsedSeconds, validationAxis, velocityDerivedAcceleration],
  );
  const altitudeOption = useMemo(
    () => lineOption(chartLabels.pointIndex, "m", [{ name: chartLabels.altitude, data: altitude }], baseAxis),
    [altitude, baseAxis, chartLabels.altitude, chartLabels.pointIndex],
  );
  const accuracyOption = useMemo(
    () => lineOption(chartLabels.pointIndex, "m", [{ name: chartLabels.accuracy, data: accuracy }], baseAxis),
    [accuracy, baseAxis, chartLabels.accuracy, chartLabels.pointIndex],
  );
  const accelerationOption = useMemo(
    () => buildAccelerationOption(activeAccelerationSensorSets, chartLabels),
    [activeAccelerationSensorSets, chartLabels],
  );
  const velocityAccelerationOption = useMemo(
    () => buildVelocityAccelerationOption(velocity, activeAccelerationSensorSets, chartLabels),
    [activeAccelerationSensorSets, chartLabels, velocity],
  );
  const pitchRollYawOption = useMemo(
    () =>
      lineOption(chartLabels.elapsedSeconds, "deg", [
        { name: chartLabels.pitchRollX, data: orientation.map((row) => [row[0], row[1]]) },
        { name: chartLabels.pitchRollY, data: orientation.map((row) => [row[0], row[2]]) },
        { name: chartLabels.yawZ, data: orientation.map((row) => [row[0], row[3]]) },
      ]),
    [chartLabels.elapsedSeconds, chartLabels.pitchRollX, chartLabels.pitchRollY, chartLabels.yawZ, orientation],
  );
  const frictionChartOption = useMemo(() => frictionOption(friction, chartLabels), [chartLabels, friction]);

  return (
    <section className="content-band">
      <div className="chart-view-header">
        <h2>{t("charts.title")}</h2>
        <div className="row-actions">
          <StatusBadge tone={transformBadgeTone(transformMode)}>{formatTransformMode(transformMode, t)}</StatusBadge>
          <button type="button" className="button" onClick={selectVisibleVelocityRange} disabled={!points.length || !onActiveSegment}>
            {t("charts.useVisibleVelocityRange")}
          </button>
        </div>
      </div>

      <section className="chart-grid">
        <Panel
          title={t("charts.averages")}
          eyebrow={activeSegment ? t("charts.selectedSegment") : t("charts.visibleRoute")}
          actions={<StatusBadge>{`${summary.startIndex}-${summary.endIndex}`}</StatusBadge>}
          className="wide-chart"
          bodyClassName="metric-grid"
        >
          <Metric label={t("charts.selectedPoints")} value={String(summary.pointCount)} />
          <Metric label={t("charts.averageSpeed")} value={`${summary.averageSpeedKmh.toFixed(1)} km/h`} />
          <Metric label={t("charts.maxSpeed")} value={`${summary.maxSpeedKmh.toFixed(1)} km/h`} />
          <Metric label={t("charts.distance")} value={`${summary.distanceKm.toFixed(3)} km`} />
          <Metric label={t("charts.maxDerivedAccel")} value={`${summary.maxDerivedAccelMps2.toFixed(2)} m/s^2`} />
        </Panel>

        <ChartPanel
          title={chartTitles.velocity}
          ariaLabel={t("charts.chartAria", { title: chartTitles.velocity })}
          className="wide-chart"
          option={velocityOption}
          onPoint={selectPoint}
          onBrushSegment={selectBrushSegment}
        />
        <ChartPanel
          title={chartTitles.distance}
          ariaLabel={t("charts.chartAria", { title: chartTitles.distance })}
          className="wide-chart"
          option={distanceOption}
        />
        <ChartPanel
          title={chartTitles.derivedAcceleration}
          ariaLabel={t("charts.chartAria", { title: chartTitles.derivedAcceleration })}
          className="wide-chart"
          option={derivedAccelerationOption}
        />
        <ChartPanel
          title={chartTitles.altitude}
          ariaLabel={t("charts.chartAria", { title: chartTitles.altitude })}
          option={altitudeOption}
          onPoint={selectPoint}
        />
        <ChartPanel
          title={chartTitles.accuracy}
          ariaLabel={t("charts.chartAria", { title: chartTitles.accuracy })}
          option={accuracyOption}
          onPoint={selectPoint}
        />
        <ChartPanel
          title={chartTitles.acceleration}
          ariaLabel={t("charts.chartAria", { title: chartTitles.acceleration })}
          className="wide-chart"
          option={accelerationOption}
        />
        <ChartPanel
          title={chartTitles.velocityAcceleration}
          ariaLabel={t("charts.chartAria", { title: chartTitles.velocityAcceleration })}
          className="wide-chart"
          option={velocityAccelerationOption}
        />
        <ChartPanel
          title={chartTitles.pitchRollYaw}
          ariaLabel={t("charts.chartAria", { title: chartTitles.pitchRollYaw })}
          option={pitchRollYawOption}
        />
        <ChartPanel
          title={chartTitles.frictionCircle}
          ariaLabel={t("charts.chartAria", { title: chartTitles.frictionCircle })}
          option={frictionChartOption}
        />
      </section>
    </section>
  );
}

interface SeriesData {
  name: string;
  data: number[][];
}

interface ChartSeriesLabels {
  acceleration: string;
  accuracy: string;
  altitude: string;
  derivedAcceleration: string;
  distance: string;
  elapsedSeconds: string;
  friction: string;
  lateralG: string;
  longitudinalG: string;
  pitchRollX: string;
  pitchRollY: string;
  pointIndex: string;
  velocity: string;
  yawZ: string;
}

function buildAccelerationSeries(sensorSets: AccelerationSensorSet[], labels: ChartSeriesLabels): SeriesData[] {
  return sensorSets.flatMap((sensorSet) => {
    const label = sensorSet.label.trim() || labels.acceleration;
    return [
      { name: `${label} GX`, data: sensorSet.sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelX)]) },
      { name: `${label} GY`, data: sensorSet.sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelY)]) },
      { name: `${label} GZ`, data: sensorSet.sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelZ)]) },
    ];
  });
}

function buildAccelerationOption(sensorSets: AccelerationSensorSet[], labels: ChartSeriesLabels): EChartsOption {
  return lineOption(labels.elapsedSeconds, "g", buildAccelerationSeries(sensorSets, labels));
}

function buildVelocityAccelerationOption(
  velocity: number[][],
  sensorSets: AccelerationSensorSet[],
  labels: ChartSeriesLabels,
): EChartsOption {
  return velocityAccelOption(velocity, buildAccelerationSeries(sensorSets, labels), labels);
}

function lineOption(
  xName: string,
  yName: string,
  series: SeriesData[],
  markLineData: Array<{ xAxis: number }> = [],
  brush = false,
): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    toolbox: brush ? { right: 8, top: 0, feature: { brush: { type: ["lineX", "clear"] } } } : undefined,
    brush: brush
      ? {
          xAxisIndex: 0,
          brushMode: "single",
          throttleType: "debounce",
          throttleDelay: 120,
        }
      : undefined,
    grid: { left: 52, right: 20, top: 42, bottom: 42 },
    xAxis: { type: "value", name: xName, nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", name: yName },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 8 }],
    series: series.map((item) => ({
      type: "line",
      name: item.name,
      data: item.data,
      showSymbol: item.data.length < 80,
      symbolSize: 6,
      markLine: markLineData.length ? { symbol: "none", data: markLineData } : undefined,
    })),
  };
}

function velocityAccelOption(velocity: number[][], accelerationSeries: SeriesData[], labels: ChartSeriesLabels): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: [{ left: 52, right: 24, top: 42, height: 100 }, { left: 52, right: 24, top: 190, height: 100 }],
    xAxis: [
      { type: "value", gridIndex: 0, name: labels.pointIndex },
      { type: "value", gridIndex: 1, name: labels.elapsedSeconds },
    ],
    yAxis: [
      { type: "value", gridIndex: 0, name: "km/h" },
      { type: "value", gridIndex: 1, name: "g" },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1] }],
    series: [
      { type: "line", name: labels.velocity, data: velocity, xAxisIndex: 0, yAxisIndex: 0, showSymbol: false },
      ...accelerationSeries.map((series) => ({
        type: "line" as const,
        name: series.name,
        data: series.data,
        xAxisIndex: 1,
        yAxisIndex: 1,
        showSymbol: false,
      })),
    ],
  };
}

function frictionOption(data: number[][], labels: ChartSeriesLabels): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: "item" },
    grid: { left: 50, right: 20, top: 22, bottom: 42 },
    xAxis: { type: "value", name: labels.lateralG, min: -1.5, max: 1.5 },
    yAxis: { type: "value", name: labels.longitudinalG, min: -1.5, max: 1.5 },
    series: [
      {
        type: "scatter",
        name: labels.friction,
        data,
        symbolSize: 4,
        itemStyle: { color: "#d62828", opacity: 0.55 },
      },
    ],
  };
}

function toG(sensor: SensorPoint, value: number): number {
  return sensor.accelUnit === "g" ? value : value / GRAVITY_MPS2;
}

function clampIndex(value: number, pointCount: number): number {
  const index = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(pointCount - 1, Math.max(0, index));
}

function formatTransformMode(mode: TransformMode, t: ReturnType<typeof useI18n>["t"]): string {
  const labels = {
    raw: "workspace.transform.raw",
    calibrated: "workspace.transform.calibrated",
    filtered: "workspace.transform.filtered",
    compare: "workspace.transform.compare",
  } as const satisfies Record<TransformMode, Parameters<typeof t>[0]>;
  return t(labels[mode]);
}

function transformSeriesLabel(mode: TransformMode, t: ReturnType<typeof useI18n>["t"]): string {
  return formatTransformMode(mode, t);
}

function localizeAccelerationSensorSets(
  sensorSets: AccelerationSensorSet[],
  t: ReturnType<typeof useI18n>["t"],
): AccelerationSensorSet[] {
  return sensorSets.map((sensorSet) => ({ ...sensorSet, label: localizeKnownTransformLabel(sensorSet.label, t) }));
}

function localizeKnownTransformLabel(label: string, t: ReturnType<typeof useI18n>["t"]): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "raw") {
    return t("workspace.transform.raw");
  }
  if (normalized === "calibrated") {
    return t("workspace.transform.calibrated");
  }
  if (normalized === "filtered") {
    return t("workspace.transform.filtered");
  }
  if (normalized === "compare") {
    return t("workspace.transform.compare");
  }
  return label;
}

function transformBadgeTone(mode: TransformMode): "neutral" | "success" | "warning" | "info" {
  if (mode === "filtered") {
    return "success";
  }
  if (mode === "compare") {
    return "warning";
  }
  if (mode === "calibrated") {
    return "info";
  }
  return "neutral";
}
