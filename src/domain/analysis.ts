import { routeDistanceKm } from "./statistics";
import type {
  ActiveSegment,
  AxisAlignedRegion,
  GpsPoint,
  RegionSummary,
  SegmentSummary,
  SensorPoint,
  SourceVisibility,
  ValidationRow,
  VtaFile,
} from "./types";

export interface RouteDistanceRow {
  index: number;
  elapsedSeconds: number;
  distanceKm: number;
  speedKmh: number;
}

export function displayGpsPointsWithSources(file: VtaFile, sources: SourceVisibility): GpsPoint[] {
  const points = [
    ...(sources.rawGps ? file.gpsPoints : []),
    ...(sources.enhancedGps ? file.enhancedPoints : []),
  ];
  return [...points].sort(compareGpsPoints);
}

export function normalizeSegment(segment: ActiveSegment, pointCount: number): ActiveSegment {
  const start = clampIndex(segment.startIndex, pointCount);
  const end = clampIndex(segment.endIndex, pointCount);
  return {
    startIndex: Math.min(start, end),
    endIndex: Math.max(start, end),
    source: segment.source,
  };
}

export function summarizeSegment(
  file: VtaFile,
  sensors: SensorPoint[],
  segment: ActiveSegment,
  sources: SourceVisibility,
): SegmentSummary {
  const points = displayGpsPointsWithSources(file, sources);
  const normalized = normalizeSegment(segment, points.length);
  const selectedPoints = points.slice(normalized.startIndex, normalized.endIndex + 1);
  const selectedSensors = segmentSensorPoints(points, selectedPoints, sensors);
  const altitudes = selectedPoints.map((point) => point.altitudeMeters).filter(Number.isFinite);
  const speeds = selectedPoints.map((point) => point.speedKmh).filter(Number.isFinite);

  return {
    pointCount: selectedPoints.length,
    sensorCount: selectedSensors.length,
    durationSeconds: selectedPoints.length ? elapsedSecondsBetween(selectedPoints[0], selectedPoints[selectedPoints.length - 1]) : 0,
    distanceKm: routeDistanceKm(selectedPoints),
    averageSpeedKmh: average(speeds) ?? 0,
    maxSpeedKmh: speeds.length ? Math.max(...speeds) : 0,
    minAltitudeMeters: altitudes.length ? Math.min(...altitudes) : undefined,
    maxAltitudeMeters: altitudes.length ? Math.max(...altitudes) : undefined,
    warningCount: countWarningsInPointRange(file, selectedPoints),
  };
}

export function routeDistanceSeries(points: GpsPoint[]): RouteDistanceRow[] {
  let distanceKm = 0;
  const firstPoint = points[0];
  return points.map((point, index) => {
    if (index > 0) {
      distanceKm += routeDistanceKm([points[index - 1], point]);
    }
    return {
      index: point.index,
      elapsedSeconds: firstPoint ? elapsedSecondsBetween(firstPoint, point) : 0,
      distanceKm,
      speedKmh: point.speedKmh,
    };
  });
}

export function buildValidationRows(points: GpsPoint[]): ValidationRow[] {
  const firstPoint = points[0];
  const rows: ValidationRow[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const deltaSeconds = elapsedSecondsBetween(previous, point);
    const deltaSpeedKmh = point.speedKmh - previous.speedKmh;
    rows.push({
      index: point.index,
      elapsedSeconds: firstPoint ? elapsedSecondsBetween(firstPoint, point) : 0,
      speedKmh: point.speedKmh,
      deltaSpeedKmh,
      derivedAccelMps2: deltaSeconds > 0 ? (deltaSpeedKmh / 3.6) / deltaSeconds : 0,
    });
  }
  return rows;
}

export function summarizeAxisAlignedRegion(points: GpsPoint[], region: AxisAlignedRegion): RegionSummary {
  const bounds = normalizeRegion(region);
  const selected = points.filter((point) => isPointInRegion(point, bounds));
  const speeds = selected.map((point) => point.speedKmh).filter(Number.isFinite);
  const altitudes = selected.map((point) => point.altitudeMeters).filter(Number.isFinite);

  return {
    pointCount: selected.length,
    distanceKm: regionDistanceKm(points, bounds),
    averageSpeedKmh: average(speeds) ?? 0,
    maxSpeedKmh: speeds.length ? Math.max(...speeds) : 0,
    minAltitudeMeters: altitudes.length ? Math.min(...altitudes) : undefined,
    maxAltitudeMeters: altitudes.length ? Math.max(...altitudes) : undefined,
  };
}

function compareGpsPoints(left: GpsPoint, right: GpsPoint): number {
  const leftTime = left.epochMillis ?? left.elapsedRealtimeNanos ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right.epochMillis ?? right.elapsedRealtimeNanos ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.index - right.index;
}

function clampIndex(value: number, pointCount: number): number {
  if (pointCount <= 0) {
    return 0;
  }
  const index = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(pointCount - 1, Math.max(0, index));
}

function segmentSensorPoints(allPoints: GpsPoint[], selectedPoints: GpsPoint[], sensors: SensorPoint[]): SensorPoint[] {
  if (!selectedPoints.length || !sensors.length) {
    return [];
  }

  const firstPoint = allPoints[0];
  const firstSelected = selectedPoints[0];
  const lastSelected = selectedPoints[selectedPoints.length - 1];
  if (!firstPoint || !canCompareTime(firstPoint, firstSelected) || !canCompareTime(firstSelected, lastSelected)) {
    return [];
  }

  const startSeconds = elapsedSecondsBetween(firstPoint, firstSelected);
  const endSeconds = startSeconds + elapsedSecondsBetween(firstSelected, lastSelected);
  const minSeconds = Math.min(startSeconds, endSeconds);
  const maxSeconds = Math.max(startSeconds, endSeconds);
  return sensors.filter((sensor) => sensor.elapsedSeconds >= minSeconds && sensor.elapsedSeconds <= maxSeconds);
}

function countWarningsInPointRange(file: VtaFile, selectedPoints: GpsPoint[]): number {
  const lineNumbers = selectedPoints.map((point) => point.lineNumber);
  if (!lineNumbers.length) {
    return 0;
  }
  const minLine = Math.min(...lineNumbers);
  const maxLine = Math.max(...lineNumbers);
  return file.parseWarnings.filter(
    (warning) => warning.lineNumber !== undefined && warning.lineNumber >= minLine && warning.lineNumber <= maxLine,
  ).length;
}

function elapsedSecondsBetween(left: GpsPoint, right: GpsPoint): number {
  if (left.elapsedRealtimeNanos !== undefined && right.elapsedRealtimeNanos !== undefined) {
    return Math.max(0, (right.elapsedRealtimeNanos - left.elapsedRealtimeNanos) / 1_000_000_000);
  }
  if (left.epochMillis !== undefined && right.epochMillis !== undefined) {
    return Math.max(0, (right.epochMillis - left.epochMillis) / 1000);
  }
  return Math.max(0, right.index - left.index);
}

function canCompareTime(left: GpsPoint, right: GpsPoint): boolean {
  return (
    (left.epochMillis !== undefined && right.epochMillis !== undefined) ||
    (left.elapsedRealtimeNanos !== undefined && right.elapsedRealtimeNanos !== undefined) ||
    Number.isFinite(left.index + right.index)
  );
}

function normalizeRegion(region: AxisAlignedRegion): AxisAlignedRegion {
  return {
    minLatitude: Math.min(region.minLatitude, region.maxLatitude),
    maxLatitude: Math.max(region.minLatitude, region.maxLatitude),
    minLongitude: Math.min(region.minLongitude, region.maxLongitude),
    maxLongitude: Math.max(region.minLongitude, region.maxLongitude),
  };
}

function regionDistanceKm(points: GpsPoint[], bounds: AxisAlignedRegion): number {
  let distanceKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (isPointInRegion(previous, bounds) && isPointInRegion(point, bounds)) {
      distanceKm += routeDistanceKm([previous, point]);
    }
  }
  return distanceKm;
}

function isPointInRegion(point: GpsPoint, bounds: AxisAlignedRegion): boolean {
  return (
    point.latitude >= bounds.minLatitude &&
    point.latitude <= bounds.maxLatitude &&
    point.longitude >= bounds.minLongitude &&
    point.longitude <= bounds.maxLongitude
  );
}

function average(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
