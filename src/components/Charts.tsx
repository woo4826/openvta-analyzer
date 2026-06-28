import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type { SensorPoint, VtaFile } from "../domain/types";
import { GRAVITY_MPS2 } from "../domain/types";
import { displayGpsPoints } from "../domain/statistics";

interface ChartsProps {
  file: VtaFile;
  sensors: SensorPoint[];
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
}

export function Charts({ file, sensors, selectedPointIndex, onSelectedPointIndex }: ChartsProps) {
  const points = displayGpsPoints(file);
  const velocity = points.map((point, index) => [index, point.speedKmh]);
  const altitude = points.map((point, index) => [index, point.altitudeMeters]);
  const accuracy = points
    .map((point, index) => (point.accuracyMeters === undefined ? undefined : [index, point.accuracyMeters]))
    .filter((value): value is number[] => value !== undefined);
  const accelX = sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelX)]);
  const accelY = sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelY)]);
  const accelZ = sensors.map((sensor) => [sensor.elapsedSeconds, toG(sensor, sensor.accelZ)]);
  const orientation = sensors
    .filter((sensor) => sensor.orientationXDegrees !== undefined || sensor.orientationYDegrees !== undefined)
    .map((sensor) => [
      sensor.elapsedSeconds,
      sensor.orientationXDegrees ?? 0,
      sensor.orientationYDegrees ?? 0,
      sensor.orientationZDegrees ?? 0,
    ]);
  const friction = sensors.map((sensor) => [toG(sensor, sensor.accelY), toG(sensor, sensor.accelX)]);

  const baseAxis = selectedPointIndex >= 0 ? [{ xAxis: selectedPointIndex }] : [];

  return (
    <section className="chart-grid">
      <ChartPanel
        title="Velocity"
        className="wide-chart"
        option={lineOption("Point index", "km/h", [{ name: "Velocity", data: velocity }], baseAxis)}
        onPoint={(index) => onSelectedPointIndex(index)}
      />
      <ChartPanel
        title="Altitude"
        option={lineOption("Point index", "m", [{ name: "Altitude", data: altitude }], baseAxis)}
        onPoint={(index) => onSelectedPointIndex(index)}
      />
      <ChartPanel
        title="GPS Accuracy"
        option={lineOption("Point index", "m", [{ name: "Accuracy", data: accuracy }], baseAxis)}
        onPoint={(index) => onSelectedPointIndex(index)}
      />
      <ChartPanel
        title="Acceleration"
        className="wide-chart"
        option={lineOption("Elapsed seconds", "g", [
          { name: "GX", data: accelX },
          { name: "GY", data: accelY },
          { name: "GZ", data: accelZ },
        ])}
      />
      <ChartPanel
        title="Velocity + Acceleration"
        className="wide-chart"
        option={velocityAccelOption(velocity, accelX, accelY, accelZ)}
        onPoint={(index) => onSelectedPointIndex(index)}
      />
      <ChartPanel
        title="Pitch / Roll / Yaw"
        option={lineOption("Elapsed seconds", "deg", [
          { name: "Pitch/Roll X", data: orientation.map((row) => [row[0], row[1]]) },
          { name: "Pitch/Roll Y", data: orientation.map((row) => [row[0], row[2]]) },
          { name: "Yaw Z", data: orientation.map((row) => [row[0], row[3]]) },
        ])}
      />
      <ChartPanel title="Friction Circle" option={frictionOption(friction)} />
    </section>
  );
}

interface SeriesData {
  name: string;
  data: number[][];
}

function ChartPanel({
  title,
  option,
  className,
  onPoint,
}: {
  title: string;
  option: EChartsOption;
  className?: string;
  onPoint?: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const mergedClass = className ? `panel ${className}` : "panel";

  useEffect(() => {
    if (!ref.current) return;
    const chart = chartRef.current ?? echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption(option, true);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    if (onPoint) {
      chart.off("click");
      chart.on("click", (params) => {
        if (typeof params.dataIndex === "number") {
          onPoint(params.dataIndex);
        }
      });
    }
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [option, onPoint]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  return (
    <div className={mergedClass}>
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="panel-body">
        <div className="chart" ref={ref} role="img" aria-label={`${title} chart`} />
      </div>
    </div>
  );
}

function lineOption(
  xName: string,
  yName: string,
  series: SeriesData[],
  markLineData: Array<{ xAxis: number }> = [],
): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
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
