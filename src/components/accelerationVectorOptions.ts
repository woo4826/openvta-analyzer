import type { EChartsOption } from "echarts";
import type {
  SynchronizedAccelerationSample,
  SynchronizedAccelerationSeries,
} from "../domain/types";
import { FOCUSED_LAP_COLOR, REFERENCE_LAP_COLOR } from "./segmentTelemetryOptions";

const STRUCTURE_COLOR = "#cbd5e1";
const AXIS_COLOR = "#64748b";
const ORIGIN: [number, number, number] = [0, 0, 0];

export interface AccelerationVectorSnapshot {
  focused?: SynchronizedAccelerationSample;
  reference?: SynchronizedAccelerationSample;
  focusedTrail: SynchronizedAccelerationSample[];
}

export interface AccelerationVectorLabels {
  deviceX: string;
  deviceY: string;
  deviceZ: string;
  focusedLap: string;
  referenceLap: string;
  localTrail: string;
}

export function accelerationVectorSnapshot(
  focused: SynchronizedAccelerationSeries | undefined,
  reference: SynchronizedAccelerationSeries | undefined,
  cursorDistanceMeters: number,
  trailLength = 25,
): AccelerationVectorSnapshot {
  const focusedIndex = nearestDistanceIndex(focused?.samples ?? [], cursorDistanceMeters);
  const referenceIndex = nearestDistanceIndex(reference?.samples ?? [], cursorDistanceMeters);
  const boundedTrailLength = Math.max(1, Math.floor(trailLength));
  return {
    focused: focusedIndex === undefined ? undefined : focused?.samples[focusedIndex],
    reference: referenceIndex === undefined ? undefined : reference?.samples[referenceIndex],
    focusedTrail: focusedIndex === undefined
      ? []
      : (focused?.samples ?? []).slice(Math.max(0, focusedIndex - boundedTrailLength + 1), focusedIndex + 1),
  };
}

export function accelerationVectorScale(snapshot: AccelerationVectorSnapshot): number {
  const samples = [
    ...snapshot.focusedTrail,
    ...(snapshot.focused ? [snapshot.focused] : []),
    ...(snapshot.reference ? [snapshot.reference] : []),
  ];
  const maximum = Math.max(1.5, ...samples.flatMap((sample) => [
    Math.abs(sample.accelXG),
    Math.abs(sample.accelYG),
    Math.abs(sample.accelZG),
  ]));
  return Math.ceil(maximum * 2) / 2;
}

export function buildAccelerationGgOption(
  snapshot: AccelerationVectorSnapshot,
  labels: AccelerationVectorLabels,
): EChartsOption {
  const scale = accelerationVectorScale(snapshot);
  const rings = Array.from({ length: Math.floor(scale / 0.5) }, (_, index) => (index + 1) * 0.5);
  const series: Array<Record<string, unknown>> = rings.map((radius) => ({
    id: `ring-${formatRingId(radius)}`,
    name: `${radius.toFixed(1)} g`,
    type: "line",
    data: circlePoints(radius),
    showSymbol: false,
    silent: true,
    animation: false,
    lineStyle: {
      color: STRUCTURE_COLOR,
      width: Number.isInteger(radius) ? 1.25 : 0.8,
      opacity: Number.isInteger(radius) ? 0.82 : 0.58,
    },
  }));

  if (snapshot.focusedTrail.length > 1) {
    series.push({
      id: "focused-trail",
      name: labels.localTrail,
      type: "line",
      data: snapshot.focusedTrail.map(xy),
      showSymbol: false,
      silent: true,
      animation: false,
      lineStyle: { color: FOCUSED_LAP_COLOR, width: 2, opacity: 0.35 },
    });
  }
  if (snapshot.focused) {
    series.push(vector2d("focused-vector", snapshot.focused, FOCUSED_LAP_COLOR, false));
  }
  if (snapshot.reference) {
    series.push(vector2d("reference-vector", snapshot.reference, REFERENCE_LAP_COLOR, true));
  }
  if (snapshot.reference) {
    series.push({
      id: "reference-point",
      name: labels.referenceLap,
      type: "scatter",
      data: [xy(snapshot.reference)],
      symbol: "diamond",
      symbolSize: 14,
      silent: true,
      animation: false,
      itemStyle: { color: "#ffffff", borderColor: REFERENCE_LAP_COLOR, borderWidth: 3 },
      z: 12,
    });
  }
  if (snapshot.focused) {
    series.push({
      id: "focused-point",
      name: labels.focusedLap,
      type: "scatter",
      data: [xy(snapshot.focused)],
      symbol: "circle",
      symbolSize: 16,
      silent: true,
      animation: false,
      itemStyle: { color: FOCUSED_LAP_COLOR, borderColor: "#ffffff", borderWidth: 2 },
      z: 13,
    });
  }

  return {
    animation: false,
    grid: { left: 54, right: 20, top: 20, bottom: 46, containLabel: false },
    xAxis: accelerationAxis(labels.deviceX, scale),
    yAxis: accelerationAxis(labels.deviceY, scale),
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => vectorTooltip(params, labels),
    },
    series: series as EChartsOption["series"],
  };
}

export function buildAcceleration3dOption(
  snapshot: AccelerationVectorSnapshot,
  labels: AccelerationVectorLabels,
): EChartsOption {
  const scale = accelerationVectorScale(snapshot);
  const series: Array<Record<string, unknown>> = [unitSphereSeries()];

  if (snapshot.focusedTrail.length > 1) {
    series.push({
      id: "focused-trail-3d",
      name: labels.localTrail,
      type: "line3D",
      data: snapshot.focusedTrail.map(xyz),
      silent: true,
      lineStyle: { color: FOCUSED_LAP_COLOR, width: 3, opacity: 0.34 },
    });
  }
  if (snapshot.focused) {
    series.push(vector3d("focused-vector-3d", snapshot.focused, FOCUSED_LAP_COLOR, false));
  }
  if (snapshot.reference) {
    series.push(vector3d("reference-vector-3d", snapshot.reference, REFERENCE_LAP_COLOR, true));
    series.push({
      id: "reference-point-3d",
      name: labels.referenceLap,
      type: "scatter3D",
      data: [xyz(snapshot.reference)],
      symbol: "diamond",
      symbolSize: 13,
      silent: true,
      itemStyle: { color: REFERENCE_LAP_COLOR, opacity: 0.82 },
    });
  }
  if (snapshot.focused) {
    series.push({
      id: "focused-point-3d",
      name: labels.focusedLap,
      type: "scatter3D",
      data: [xyz(snapshot.focused)],
      symbol: "circle",
      symbolSize: 17,
      silent: true,
      itemStyle: { color: FOCUSED_LAP_COLOR, opacity: 1 },
    });
  }

  return {
    animation: false,
    tooltip: {
      formatter: (params: unknown) => vectorTooltip(params, labels),
    },
    xAxis3D: acceleration3dAxis(labels.deviceX, scale),
    yAxis3D: acceleration3dAxis(labels.deviceY, scale),
    zAxis3D: acceleration3dAxis(labels.deviceZ, scale),
    grid3D: {
      boxWidth: 100,
      boxDepth: 100,
      boxHeight: 100,
      environment: "#ffffff",
      viewControl: {
        autoRotate: false,
        projection: "perspective",
        distance: 190,
        alpha: 22,
        beta: 36,
      },
      light: {
        main: { intensity: 0.8, shadow: false },
        ambient: { intensity: 0.65 },
      },
    },
    series,
  } as unknown as EChartsOption;
}

function nearestDistanceIndex(samples: SynchronizedAccelerationSample[], target: number): number | undefined {
  if (!samples.length) return undefined;
  if (!Number.isFinite(target) || target <= samples[0].distanceMeters) return 0;
  const lastIndex = samples.length - 1;
  if (target >= samples[lastIndex].distanceMeters) return lastIndex;

  let low = 0;
  let high = lastIndex;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].distanceMeters < target) low = middle + 1;
    else high = middle;
  }
  const right = low;
  const left = Math.max(0, right - 1);
  return Math.abs(samples[left].distanceMeters - target) <= Math.abs(samples[right].distanceMeters - target)
    ? left
    : right;
}

function accelerationAxis(name: string, scale: number): Record<string, unknown> {
  return {
    type: "value",
    name: `${name} (g)`,
    nameLocation: "middle",
    nameGap: 28,
    min: -scale,
    max: scale,
    interval: 0.5,
    axisLabel: { color: AXIS_COLOR, formatter: (value: number) => value.toFixed(1) },
    axisLine: { show: true, onZero: true, lineStyle: { color: AXIS_COLOR, width: 1 } },
    splitLine: { show: false },
  };
}

function acceleration3dAxis(name: string, scale: number): Record<string, unknown> {
  return {
    type: "value",
    name: `${name} (g)`,
    min: -scale,
    max: scale,
    interval: 0.5,
    nameTextStyle: { color: AXIS_COLOR },
    axisLabel: { color: AXIS_COLOR, formatter: (value: number) => value.toFixed(1) },
    axisLine: { lineStyle: { color: AXIS_COLOR, opacity: 0.68 } },
    splitLine: { lineStyle: { color: STRUCTURE_COLOR, opacity: 0.42 } },
    axisPointer: { show: false },
  };
}

function circlePoints(radius: number): number[][] {
  return Array.from({ length: 97 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

function vector2d(
  id: string,
  sample: SynchronizedAccelerationSample,
  color: string,
  dashed: boolean,
): Record<string, unknown> {
  return {
    id,
    type: "line",
    data: [[0, 0], xy(sample)],
    showSymbol: false,
    silent: true,
    animation: false,
    lineStyle: { color, width: 2.5, type: dashed ? "dashed" : "solid", opacity: dashed ? 0.72 : 0.92 },
    z: 10,
  };
}

function vector3d(
  id: string,
  sample: SynchronizedAccelerationSample,
  color: string,
  dashed: boolean,
): Record<string, unknown> {
  return {
    id,
    type: "line3D",
    data: [ORIGIN, xyz(sample)],
    silent: true,
    lineStyle: { color, width: dashed ? 3 : 5, opacity: dashed ? 0.68 : 0.92 },
  };
}

function unitSphereSeries(): Record<string, unknown> {
  return {
    id: "unit-sphere",
    name: "1.0 g",
    type: "surface",
    parametric: true,
    silent: true,
    shading: "color",
    wireframe: { show: true, lineStyle: { color: STRUCTURE_COLOR, width: 1, opacity: 0.26 } },
    itemStyle: { color: "#cbd5e1", opacity: 0.035 },
    parametricEquation: {
      u: { min: -Math.PI, max: Math.PI, step: Math.PI / 24 },
      v: { min: 0, max: Math.PI, step: Math.PI / 24 },
      x: (u: number, v: number) => Math.cos(u) * Math.sin(v),
      y: (u: number, v: number) => Math.sin(u) * Math.sin(v),
      z: (_u: number, v: number) => Math.cos(v),
    },
  };
}

function xy(sample: SynchronizedAccelerationSample): [number, number] {
  return [sample.accelXG, sample.accelYG];
}

function xyz(sample: SynchronizedAccelerationSample): [number, number, number] {
  return [sample.accelXG, sample.accelYG, sample.accelZG];
}

function formatRingId(radius: number): string {
  return Number.isInteger(radius) ? String(radius) : radius.toFixed(1);
}

function vectorTooltip(params: unknown, labels: AccelerationVectorLabels): string {
  if (!isRecord(params) || !Array.isArray(params.value)) return "";
  const values = params.value.map(Number);
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) return "";
  const z = values.length > 2 ? `<br/>${labels.deviceZ}: ${values[2].toFixed(2)} g` : "";
  return `${String(params.seriesName ?? "")}<br/>${labels.deviceX}: ${values[0].toFixed(2)} g<br/>${labels.deviceY}: ${values[1].toFixed(2)} g${z}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
