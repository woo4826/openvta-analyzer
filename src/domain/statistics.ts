import type { GpsPoint, SummaryStats, VtaFile } from "./types";

export function displayGpsPoints(file: VtaFile): GpsPoint[] {
  return [...file.gpsPoints, ...file.enhancedPoints].sort((left, right) => {
    const leftTime = left.epochMillis ?? left.elapsedRealtimeNanos ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.epochMillis ?? right.elapsedRealtimeNanos ?? Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.index - right.index;
  });
}

export function summarizeVta(file: VtaFile): SummaryStats {
  const points = displayGpsPoints(file);
  const speeds = points.map((point) => point.speedKmh);
  const movingSpeeds = speeds.filter((speed) => speed > 0.1);
  const altitudes = points.map((point) => point.altitudeMeters).filter(Number.isFinite);
  const accuracies = points.map((point) => point.accuracyMeters).filter((value): value is number => value !== undefined);
  const startTime = firstDefined(points.map((point) => point.epochMillis));
  const endTime = lastDefined(points.map((point) => point.epochMillis));
  const durationSeconds =
    startTime !== undefined && endTime !== undefined
      ? Math.max(0, (endTime - startTime) / 1000)
      : estimateDurationFromRows(file);

  return {
    durationSeconds,
    distanceKm: routeDistanceKm(points),
    maxSpeedKmh: speeds.length ? Math.max(...speeds) : 0,
    averageMovingSpeedKmh: average(movingSpeeds) ?? 0,
    minAltitudeMeters: altitudes.length ? Math.min(...altitudes) : undefined,
    maxAltitudeMeters: altitudes.length ? Math.max(...altitudes) : undefined,
    averageAccuracyMeters: average(accuracies),
    startTime,
    endTime,
    gpsCount: file.gpsPoints.length,
    enhancedCount: file.enhancedPoints.length,
    sensorCount: file.sensorPoints.length,
  };
}

export function routeDistanceKm(points: GpsPoint[]): number {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += haversineMeters(points[index - 1], points[index]);
  }
  return meters / 1000;
}

function haversineMeters(left: GpsPoint, right: GpsPoint): number {
  const radiusMeters = 6_371_000;
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLon = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function average(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function firstDefined(values: Array<number | undefined>): number | undefined {
  return values.find((value): value is number => value !== undefined);
}

function lastDefined(values: Array<number | undefined>): number | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== undefined) {
      return values[index];
    }
  }
  return undefined;
}

function estimateDurationFromRows(file: VtaFile): number {
  const first = file.sensorPoints[0]?.elapsedSeconds;
  const last = file.sensorPoints[file.sensorPoints.length - 1]?.elapsedSeconds;
  if (first !== undefined && last !== undefined) {
    return Math.max(0, last - first);
  }
  return Math.max(0, displayGpsPoints(file).length - 1);
}

