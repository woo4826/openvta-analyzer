import {
  GRAVITY_MPS2,
  type GpsPoint,
  type SegmentTrajectorySample,
  type SensorPoint,
  type SensorSynchronizationMethod,
  type SynchronizedAccelerationSample,
  type SynchronizedAccelerationSeries,
} from "./types";

interface TrajectoryAnchor {
  sourceIndex: number;
  sourcePosition: number;
  distanceMeters: number;
  elapsedSeconds: number;
  timestampNanos?: number;
  lineNumber: number;
}

interface MappedAccelerationSample extends SynchronizedAccelerationSample {
  sensorElapsedSeconds: number;
}

export function synchronizeAccelerationToTrajectory(
  points: GpsPoint[],
  sensors: SensorPoint[],
  trajectory: SegmentTrajectorySample[],
): SynchronizedAccelerationSeries | undefined {
  if (!points.length || !sensors.length || trajectory.length < 2) return undefined;
  const anchors = trajectoryAnchors(points, trajectory);
  if (anchors.length < 2) return undefined;

  const method = synchronizationMethod(anchors, sensors);
  const keyedAnchors = monotonicAnchors(anchors, method);
  if (keyedAnchors.length < 2) return undefined;
  const mapped = mapSensors(sensors, keyedAnchors, method);
  const samples = coalesceSamples(mapped);
  return samples.length ? { method, samples } : undefined;
}

function trajectoryAnchors(points: GpsPoint[], trajectory: SegmentTrajectorySample[]): TrajectoryAnchor[] {
  const grouped = new Map<number, SegmentTrajectorySample[]>();
  for (const sample of trajectory) {
    const sourcePosition = finiteNumber(sample.sourcePosition) ?? sample.sourceIndex;
    if (sourcePosition < 0 || sourcePosition > points.length - 1) continue;
    const current = grouped.get(sourcePosition) ?? [];
    current.push(sample);
    grouped.set(sourcePosition, current);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([sourcePosition, samples]) => {
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.ceil(sourcePosition);
      const leftPoint = points[leftIndex];
      const rightPoint = points[rightIndex];
      const ratio = sourcePosition - leftIndex;
      return {
        sourceIndex: Math.round(sourcePosition),
        sourcePosition,
        distanceMeters: average(samples.map((sample) => sample.distanceMeters)),
        elapsedSeconds: average(samples.map((sample) => sample.elapsedSeconds)),
        timestampNanos: interpolateOptional(
          finiteNumber(leftPoint.elapsedRealtimeNanos),
          finiteNumber(rightPoint.elapsedRealtimeNanos),
          ratio,
        ),
        lineNumber: interpolate(leftPoint.lineNumber, rightPoint.lineNumber, ratio),
      };
    });
}

function synchronizationMethod(
  anchors: TrajectoryAnchor[],
  sensors: SensorPoint[],
): SensorSynchronizationMethod {
  const gpsHasTimestamps = anchors.every((anchor) => anchor.timestampNanos !== undefined);
  const sensorsHaveTimestamps = sensors.some((sensor) => finiteNumber(sensor.timestampNanos) !== undefined);
  return gpsHasTimestamps && sensorsHaveTimestamps ? "timestamp" : "line-order";
}

function monotonicAnchors(
  anchors: TrajectoryAnchor[],
  method: SensorSynchronizationMethod,
): TrajectoryAnchor[] {
  const result: TrajectoryAnchor[] = [];
  let previousKey = Number.NEGATIVE_INFINITY;
  for (const anchor of anchors) {
    const key = anchorKey(anchor, method);
    if (key === undefined || key <= previousKey) continue;
    result.push(anchor);
    previousKey = key;
  }
  return result;
}

function mapSensors(
  sensors: SensorPoint[],
  anchors: TrajectoryAnchor[],
  method: SensorSynchronizationMethod,
): MappedAccelerationSample[] {
  const firstKey = anchorKey(anchors[0], method)!;
  const lastKey = anchorKey(anchors.at(-1)!, method)!;
  const result: MappedAccelerationSample[] = [];
  let anchorIndex = 0;
  let previousSensorKey = Number.NEGATIVE_INFINITY;

  for (const sensor of sensors) {
    const key = sensorKey(sensor, method);
    if (key === undefined || key < previousSensorKey) continue;
    previousSensorKey = key;
    if (key < firstKey || key > lastKey) continue;
    while (
      anchorIndex < anchors.length - 2 &&
      key > anchorKey(anchors[anchorIndex + 1], method)!
    ) {
      anchorIndex += 1;
    }
    const left = anchors[anchorIndex];
    const right = anchors[anchorIndex + 1];
    const leftKey = anchorKey(left, method)!;
    const rightKey = anchorKey(right, method)!;
    if (rightKey <= leftKey || key < leftKey || key > rightKey) continue;
    const ratio = (key - leftKey) / (rightKey - leftKey);
    result.push({
      sensorIndex: sensor.index,
      sourceIndex: Math.round(interpolate(left.sourcePosition, right.sourcePosition, ratio)),
      distanceMeters: interpolate(left.distanceMeters, right.distanceMeters, ratio),
      elapsedSeconds: interpolate(left.elapsedSeconds, right.elapsedSeconds, ratio),
      accelXG: toG(sensor.accelX, sensor.accelUnit),
      accelYG: toG(sensor.accelY, sensor.accelUnit),
      accelZG: toG(sensor.accelZ, sensor.accelUnit),
      sensorElapsedSeconds: sensor.elapsedSeconds,
    });
  }
  return result;
}

function coalesceSamples(samples: MappedAccelerationSample[]): SynchronizedAccelerationSample[] {
  const result: SynchronizedAccelerationSample[] = [];
  let group: MappedAccelerationSample[] = [];
  const flush = () => {
    if (!group.length) return;
    const first = group[0];
    result.push({
      sensorIndex: first.sensorIndex,
      sourceIndex: first.sourceIndex,
      distanceMeters: average(group.map((sample) => sample.distanceMeters)),
      elapsedSeconds: average(group.map((sample) => sample.elapsedSeconds)),
      accelXG: average(group.map((sample) => sample.accelXG)),
      accelYG: average(group.map((sample) => sample.accelYG)),
      accelZG: average(group.map((sample) => sample.accelZG)),
    });
    group = [];
  };

  for (const sample of samples) {
    const first = group[0];
    if (
      first &&
      (sample.sensorElapsedSeconds !== first.sensorElapsedSeconds || sample.sourceIndex !== first.sourceIndex)
    ) {
      flush();
    }
    group.push(sample);
  }
  flush();
  return result;
}

function anchorKey(anchor: TrajectoryAnchor, method: SensorSynchronizationMethod): number | undefined {
  return method === "timestamp" ? anchor.timestampNanos : anchor.lineNumber;
}

function sensorKey(sensor: SensorPoint, method: SensorSynchronizationMethod): number | undefined {
  return method === "timestamp" ? finiteNumber(sensor.timestampNanos) : sensor.lineNumber;
}

function finiteNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function interpolate(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}

function interpolateOptional(left: number | undefined, right: number | undefined, ratio: number): number | undefined {
  if (left === undefined || right === undefined) return undefined;
  return interpolate(left, right, ratio);
}

function toG(value: number, unit: SensorPoint["accelUnit"]): number {
  return unit === "g" ? value : value / GRAVITY_MPS2;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
