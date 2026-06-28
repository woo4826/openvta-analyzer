import { useCallback, useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { ActiveSegment, GpsPoint, SensorPoint, TransformMode, VtaFile } from "../domain/types";
import { GRAVITY_MPS2 } from "../domain/types";
import { buildValidationRows, routeDistanceSeries, summarizePointRange } from "../domain/analysis";
import { displayGpsPoints } from "../domain/statistics";
import { ChartPanel } from "./ChartPanel";
import { Metric, Panel, StatusBadge } from "./ui";

interface ChartsProps {
  file: VtaFile;
  sensors: SensorPoint[];
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  activeSegment?: ActiveSegment;
  onActiveSegment?: (segment?: ActiveSegment) => void;
  transformMode?: TransformMode;
  visiblePoints?: GpsPoint[];
}

export function Charts({
  file,
  sensors,
  selectedPointIndex,
  onSelectedPointIndex,
  activeSegment,
  onActiveSegment,
  transformMode = "raw",
  visiblePoints,
}: ChartsProps) {
  const points = useMemo(() => visiblePoints ?? displayGpsPoints(file), [file, visiblePoints]);
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
  const accelX = useMemo(() => sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelX)]), [sensors]);
  const accelY = useMemo(() => sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelY)]), [sensors]);
  const accelZ = useMemo(() => sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelZ)]), [sensors]);
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
    () => lineOption("Point index", "km/h", [{ name: "Velocity", data: velocity }], baseAxis, true),
    [baseAxis, velocity],
  );
  const distanceOption = useMemo(
    () => lineOption("Elapsed seconds", "km", [{ name: "Distance", data: distance }], distanceAxis),
    [distance, distanceAxis],
  );
  const derivedAccelerationOption = useMemo(
    () =>
      lineOption(
        "Elapsed seconds",
        "m/s^2",
        [{ name: "Derived acceleration", data: velocityDerivedAcceleration }],
        validationAxis,
      ),
    [validationAxis, velocityDerivedAcceleration],
  );
  const altitudeOption = useMemo(
    () => lineOption("Point index", "m", [{ name: "Altitude", data: altitude }], baseAxis),
    [altitude, baseAxis],
  );
  const accuracyOption = useMemo(
    () => lineOption("Point index", "m", [{ name: "Accuracy", data: accuracy }], baseAxis),
    [accuracy, baseAxis],
  );
  const accelerationOption = useMemo(
    () =>
      lineOption("Elapsed seconds", "g", [
        { name: "GX", data: accelX },
        { name: "GY", data: accelY },
        { name: "GZ", data: accelZ },
      ]),
    [accelX, accelY, accelZ],
  );
  const velocityAccelerationOption = useMemo(
    () => velocityAccelOption(velocity, accelX, accelY, accelZ),
    [accelX, accelY, accelZ, velocity],
  );
  const pitchRollYawOption = useMemo(
    () =>
      lineOption("Elapsed seconds", "deg", [
        { name: "Pitch/Roll X", data: orientation.map((row) => [row[0], row[1]]) },
        { name: "Pitch/Roll Y", data: orientation.map((row) => [row[0], row[2]]) },
        { name: "Yaw Z", data: orientation.map((row) => [row[0], row[3]]) },
      ]),
    [orientation],
  );
  const frictionChartOption = useMemo(() => frictionOption(friction), [friction]);

  return (
    <section className="content-band">
      <div className="chart-view-header">
        <h2>Charts</h2>
        <div className="row-actions">
          <StatusBadge tone={transformBadgeTone(transformMode)}>{formatTransformMode(transformMode)}</StatusBadge>
          <button type="button" className="button" onClick={selectVisibleVelocityRange} disabled={!points.length || !onActiveSegment}>
            Use visible velocity range as segment
          </button>
        </div>
      </div>

      <section className="chart-grid">
        <Panel
          title="Averages"
          eyebrow={activeSegment ? "Selected segment" : "Visible route"}
          actions={<StatusBadge>{`${summary.startIndex}-${summary.endIndex}`}</StatusBadge>}
          className="wide-chart"
          bodyClassName="metric-grid"
        >
          <Metric label="Selected points" value={String(summary.pointCount)} />
          <Metric label="Average speed" value={`${summary.averageSpeedKmh.toFixed(1)} km/h`} />
          <Metric label="Max speed" value={`${summary.maxSpeedKmh.toFixed(1)} km/h`} />
          <Metric label="Distance" value={`${summary.distanceKm.toFixed(3)} km`} />
          <Metric label="Max derived accel" value={`${summary.maxDerivedAccelMps2.toFixed(2)} m/s^2`} />
        </Panel>

        <ChartPanel
          title="Velocity"
          className="wide-chart"
          option={velocityOption}
          onPoint={selectPoint}
          onBrushSegment={selectBrushSegment}
        />
        <ChartPanel
          title="Distance over time"
          className="wide-chart"
          option={distanceOption}
        />
        <ChartPanel
          title="Velocity-derived acceleration"
          className="wide-chart"
          option={derivedAccelerationOption}
        />
        <ChartPanel title="Altitude" option={altitudeOption} onPoint={selectPoint} />
        <ChartPanel title="GPS Accuracy" option={accuracyOption} onPoint={selectPoint} />
        <ChartPanel
          title="Acceleration"
          className="wide-chart"
          option={accelerationOption}
        />
        <ChartPanel title="Velocity + Acceleration" className="wide-chart" option={velocityAccelerationOption} />
        <ChartPanel title="Pitch / Roll / Yaw" option={pitchRollYawOption} />
        <ChartPanel title="Friction Circle" option={frictionChartOption} />
      </section>
    </section>
  );
}

interface SeriesData {
  name: string;
  data: number[][];
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

function velocityAccelOption(velocity: number[][], x: number[][], y: number[][], z: number[][]): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: [{ left: 52, right: 24, top: 42, height: 100 }, { left: 52, right: 24, top: 190, height: 100 }],
    xAxis: [
      { type: "value", gridIndex: 0, name: "Point index" },
      { type: "value", gridIndex: 1, name: "Elapsed seconds" },
    ],
    yAxis: [
      { type: "value", gridIndex: 0, name: "km/h" },
      { type: "value", gridIndex: 1, name: "g" },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1] }],
    series: [
      { type: "line", name: "Velocity", data: velocity, xAxisIndex: 0, yAxisIndex: 0, showSymbol: false },
      { type: "line", name: "GX", data: x, xAxisIndex: 1, yAxisIndex: 1, showSymbol: false },
      { type: "line", name: "GY", data: y, xAxisIndex: 1, yAxisIndex: 1, showSymbol: false },
      { type: "line", name: "GZ", data: z, xAxisIndex: 1, yAxisIndex: 1, showSymbol: false },
    ],
  };
}

function frictionOption(data: number[][]): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: "item" },
    grid: { left: 50, right: 20, top: 22, bottom: 42 },
    xAxis: { type: "value", name: "Lateral G", min: -1.5, max: 1.5 },
    yAxis: { type: "value", name: "Longitudinal G", min: -1.5, max: 1.5 },
    series: [
      {
        type: "scatter",
        name: "Friction",
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

function formatTransformMode(mode: TransformMode): string {
  const labels: Record<TransformMode, string> = {
    raw: "Raw",
    calibrated: "Calibrated",
    filtered: "Filtered",
    compare: "Compare",
  };
  return labels[mode];
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
