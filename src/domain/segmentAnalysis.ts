import type { LineString, Position } from "geojson";
import { bearingDegrees, haversineMeters, routeDistanceMeters, toLocalMeters } from "./geometry";
import { gpsEvidenceConfidence } from "./gpsEvidence";
import { scopedLapComparison } from "./sectionAnalysis";
import type {
  AnalysisScope,
  GpsPoint,
  LapComparisonSample,
  LapResult,
  ScopeRange,
  SegmentAnalysisResult,
  SegmentLapRecord,
  SegmentTrajectorySample,
  TrackSection,
} from "./types";

const LOSS_RATE_HALF_WINDOW_METERS = 12.5;
const LOSS_RATE_MINIMUM_SPEED_KMH = 20;
const MAX_PROJECTED_TO_DRIVEN_RATIO = 3;
const PROJECTED_PROGRESS_TOLERANCE_METERS = 5;
const GRAVITY_MPS2 = 9.80665;

export function analysisScopeRange(
  scope: AnalysisScope,
  sections: TrackSection[],
  lineLengthMeters: number,
): ScopeRange {
  const length = Math.max(0, finiteOr(lineLengthMeters, 0));
  if (scope.kind === "whole-lap") {
    return { startDistanceMeters: 0, endDistanceMeters: length };
  }
  if (scope.kind === "section") {
    const section = sections.find((candidate) => candidate.id === scope.sectionId);
    if (!section) return { startDistanceMeters: 0, endDistanceMeters: length };
    return orderedClampedRange(section.startDistanceMeters, section.endDistanceMeters, length);
  }
  return orderedClampedRange(scope.startDistanceMeters, scope.endDistanceMeters, length);
}

export function analyzeSegmentScope(
  points: GpsPoint[],
  laps: LapResult[],
  analysisLine: LineString,
  sections: TrackSection[],
  scope: AnalysisScope,
  requestedReferenceLapId?: string,
  includePartialLapSections = false,
): SegmentAnalysisResult {
  const lineLengthMeters = routeDistanceMeters(analysisLine.coordinates);
  const range = analysisScopeRange(scope, sections, lineLengthMeters);
  if (lineLengthMeters <= 0 || range.endDistanceMeters <= range.startDistanceMeters) {
    return { scope, range, records: [] };
  }

  const scopedSection = scope.kind === "whole-lap" ? undefined : {
    id: scope.kind === "section" ? scope.sectionId : "custom-range",
    name: scope.kind === "section"
      ? sections.find((section) => section.id === scope.sectionId)?.name ?? "Section"
      : "Custom range",
    kind: scope.kind === "section"
      ? sections.find((section) => section.id === scope.sectionId)?.kind ?? "straight" as const
      : "straight" as const,
    startDistanceMeters: range.startDistanceMeters,
    endDistanceMeters: range.endDistanceMeters,
  } satisfies TrackSection;

  const raw = laps.map((lap) => buildRawRecord(
    points,
    lap,
    analysisLine,
    scopedSection,
    scope,
    lineLengthMeters,
    includePartialLapSections,
  ));
  const requestedReference = raw.find((record) =>
    record.lapId === requestedReferenceLapId && record.completion === "complete" && record.eligibleForBest && record.trajectory.length > 1);
  const defaultReference = minimumRecord(
    raw.filter((record) => record.completion === "complete"),
    (record) => record.durationSeconds,
  );
  const referenceLapId = requestedReference?.lapId ?? defaultReference?.lapId;
  const referenceLap = laps.find((lap) => lap.id === referenceLapId);

  const compared = laps.map((lap) => buildComparedRecord(
    points,
    lap,
    referenceLap,
    analysisLine,
    scopedSection,
    scope,
    lineLengthMeters,
    includePartialLapSections,
  ));
  const best = minimumRecord(compared, (record) => record.durationSeconds);
  const shortest = minimumRecord(
    compared.filter((record) => record.coverage === "complete"),
    (record) => record.drivenDistanceMeters,
  );
  const records = compared.map((record): SegmentLapRecord => ({
    ...record,
    deltaBestSeconds: best?.durationSeconds !== undefined && record.durationSeconds !== undefined
      ? record.durationSeconds - best.durationSeconds
      : undefined,
    deltaShortestMeters: shortest?.drivenDistanceMeters !== undefined && record.drivenDistanceMeters !== undefined
      ? record.drivenDistanceMeters - shortest.drivenDistanceMeters
      : undefined,
  }));

  return {
    scope,
    range,
    referenceLapId,
    fastestLapId: best?.lapId,
    shortestLapId: shortest?.lapId,
    records,
  };
}

export function scopeSourceIndexes(
  record: SegmentLapRecord,
): { startIndex: number; endIndex: number } | undefined {
  if (!record.trajectory.length) return undefined;
  return {
    startIndex: Math.min(...record.trajectory.map((sample) => sample.sourceIndex)),
    endIndex: Math.max(...record.trajectory.map((sample) => sample.sourceIndex)),
  };
}

function buildRawRecord(
  points: GpsPoint[],
  lap: LapResult,
  analysisLine: LineString,
  scopedSection: TrackSection | undefined,
  scope: AnalysisScope,
  lineLengthMeters: number,
  includePartialLapSections: boolean,
): SegmentLapRecord {
  return buildComparedRecord(
    points,
    lap,
    undefined,
    analysisLine,
    scopedSection,
    scope,
    lineLengthMeters,
    includePartialLapSections,
  );
}

function buildComparedRecord(
  points: GpsPoint[],
  lap: LapResult,
  referenceLap: LapResult | undefined,
  analysisLine: LineString,
  scopedSection: TrackSection | undefined,
  scope: AnalysisScope,
  lineLengthMeters: number,
  includePartialLapSections: boolean,
): SegmentLapRecord {
  const comparison = scopedLapComparison(points, lap, referenceLap, analysisLine, scopedSection, 5);
  const candidateTrajectory = enrichTrajectory(comparison, points, analysisLine);
  const trajectory = hasPlausibleTrajectoryProgress(candidateTrajectory) ? candidateTrajectory : [];
  const coverage = scopeCoverage(scope, lap, trajectory, lineLengthMeters);
  const hasCompleteCoverage = coverage === "complete";
  const fromPartialLap = lap.completion !== "complete";
  const durationSeconds = hasCompleteCoverage && trajectory.length > 1
    ? trajectory.at(-1)!.elapsedSeconds - trajectory[0].elapsedSeconds
    : undefined;
  const eligibleForBest = hasCompleteCoverage && lap.validity === "valid" && (
    !fromPartialLap || includePartialLapSections
  );
  const speeds = hasCompleteCoverage ? trajectory.map((sample) => sample.speedKmh) : [];
  const peakLossRate = hasCompleteCoverage
    ? maximumDefined(trajectory.map((sample) => sample.lossRateSecondsPer100m).filter(isNumber))
    : undefined;
  return {
    lapId: lap.id,
    ordinal: lap.ordinal,
    completion: lap.completion,
    validity: lap.validity,
    flags: lap.flags,
    fromPartialLap,
    coverage,
    eligibleForBest,
    durationSeconds,
    drivenDistanceMeters: hasCompleteCoverage ? trajectory.at(-1)?.pathDistanceMeters : undefined,
    entrySpeedKmh: speeds[0],
    minimumSpeedKmh: speeds.length ? Math.min(...speeds) : undefined,
    averageSpeedKmh: hasCompleteCoverage ? timeWeightedAverageSpeed(trajectory) : undefined,
    maximumSpeedKmh: speeds.length ? Math.max(...speeds) : undefined,
    exitSpeedKmh: speeds.at(-1),
    maxLateralG: hasCompleteCoverage ? maximumLateralG(trajectory) : undefined,
    maxDecelerationG: hasCompleteCoverage ? maximumDerivedDecelerationG(trajectory) : undefined,
    peakLossRateSecondsPer100m: peakLossRate !== undefined && peakLossRate > 0 ? peakLossRate : undefined,
    gpsConfidence: gpsConfidence(trajectory, points),
    trajectory,
  };
}

function hasPlausibleTrajectoryProgress(samples: SegmentTrajectorySample[]): boolean {
  if (samples.length < 2) return false;
  const projectedDistanceMeters = samples.at(-1)!.distanceMeters - samples[0].distanceMeters;
  const drivenDistanceMeters = samples.at(-1)!.pathDistanceMeters - samples[0].pathDistanceMeters;
  return projectedDistanceMeters <= drivenDistanceMeters * MAX_PROJECTED_TO_DRIVEN_RATIO + PROJECTED_PROGRESS_TOLERANCE_METERS;
}

function enrichTrajectory(
  samples: LapComparisonSample[],
  points: GpsPoint[],
  analysisLine: LineString,
): SegmentTrajectorySample[] {
  let pathDistanceMeters = 0;
  const enriched = samples.map((sample, index): SegmentTrajectorySample => {
    if (index > 0) {
      const previous = samples[index - 1];
      pathDistanceMeters += haversineMeters(
        [previous.longitude, previous.latitude],
        [sample.longitude, sample.latitude],
      );
    }
    return {
      ...sample,
      pathDistanceMeters,
      signedOffsetMeters: signedOffsetMeters([sample.longitude, sample.latitude], analysisLine),
      accuracyMeters: points[sample.sourceIndex]?.accuracyMeters,
    };
  });
  return enriched.map((sample, index) => ({
    ...sample,
    lossRateSecondsPer100m: lossRateAt(enriched, index),
  }));
}

function lossRateAt(samples: SegmentTrajectorySample[], index: number): number | undefined {
  const sample = samples[index];
  if (sample.speedKmh < LOSS_RATE_MINIMUM_SPEED_KMH || samples.length < 3) return undefined;
  const leftDistance = sample.distanceMeters - LOSS_RATE_HALF_WINDOW_METERS;
  const rightDistance = sample.distanceMeters + LOSS_RATE_HALF_WINDOW_METERS;
  let left = index;
  let right = index;
  while (left > 0 && samples[left].distanceMeters > leftDistance) left -= 1;
  while (right < samples.length - 1 && samples[right].distanceMeters < rightDistance) right += 1;
  const span = samples[right].distanceMeters - samples[left].distanceMeters;
  if (span < LOSS_RATE_HALF_WINDOW_METERS) return undefined;
  return (samples[right].deltaSeconds - samples[left].deltaSeconds) / span * 100;
}

function scopeCoverage(
  scope: AnalysisScope,
  lap: LapResult,
  trajectory: SegmentTrajectorySample[],
  lineLengthMeters: number,
): SegmentLapRecord["coverage"] {
  if (trajectory.length < 2) return "none";
  if (scope.kind !== "whole-lap") return "complete";
  const covered = trajectory.at(-1)!.distanceMeters - trajectory[0].distanceMeters;
  return lap.completion === "complete" && covered >= lineLengthMeters - 2 ? "complete" : "partial";
}

function signedOffsetMeters(coordinate: Position, line: LineString): number {
  let closestDistance = Number.POSITIVE_INFINITY;
  let signed = 0;
  for (let index = 1; index < line.coordinates.length; index += 1) {
    const start = toLocalMeters(line.coordinates[index - 1], coordinate);
    const end = toLocalMeters(line.coordinates[index], coordinate);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const spanSquared = dx * dx + dy * dy;
    const ratio = spanSquared === 0 ? 0 : Math.min(1, Math.max(0, -(start.x * dx + start.y * dy) / spanSquared));
    const nearestX = start.x + dx * ratio;
    const nearestY = start.y + dy * ratio;
    const distance = Math.hypot(nearestX, nearestY);
    if (distance >= closestDistance) continue;
    closestDistance = distance;
    const pointFromStartX = -start.x;
    const pointFromStartY = -start.y;
    const cross = dx * pointFromStartY - dy * pointFromStartX;
    signed = distance * (cross < 0 ? -1 : cross > 0 ? 1 : 0);
  }
  return signed;
}

function timeWeightedAverageSpeed(samples: SegmentTrajectorySample[]): number | undefined {
  if (!samples.length) return undefined;
  let weighted = 0;
  let duration = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const elapsed = samples[index].elapsedSeconds - samples[index - 1].elapsedSeconds;
    if (elapsed <= 0) continue;
    weighted += (samples[index - 1].speedKmh + samples[index].speedKmh) / 2 * elapsed;
    duration += elapsed;
  }
  return duration > 0 ? weighted / duration : samples[0].speedKmh;
}

function maximumDerivedDecelerationG(samples: SegmentTrajectorySample[]): number | undefined {
  let maximum = 0;
  let found = false;
  for (let index = 1; index < samples.length; index += 1) {
    const elapsed = samples[index].elapsedSeconds - samples[index - 1].elapsedSeconds;
    if (elapsed <= 0) continue;
    const acceleration = ((samples[index].speedKmh - samples[index - 1].speedKmh) / 3.6) / elapsed;
    if (acceleration < 0) {
      found = true;
      maximum = Math.max(maximum, -acceleration / GRAVITY_MPS2);
    }
  }
  return found ? maximum : undefined;
}

function maximumLateralG(samples: SegmentTrajectorySample[]): number | undefined {
  let maximum = 0;
  let found = false;
  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous: Position = [samples[index - 1].longitude, samples[index - 1].latitude];
    const current: Position = [samples[index].longitude, samples[index].latitude];
    const next: Position = [samples[index + 1].longitude, samples[index + 1].latitude];
    const span = (haversineMeters(previous, current) + haversineMeters(current, next)) / 2;
    if (span <= 0) continue;
    const turnRadians = Math.abs(signedHeadingDelta(bearingDegrees(previous, current), bearingDegrees(current, next))) * Math.PI / 180;
    const speedMps = samples[index].speedKmh / 3.6;
    found = true;
    maximum = Math.max(maximum, speedMps * speedMps * turnRadians / span / GRAVITY_MPS2);
  }
  return found ? maximum : undefined;
}

function gpsConfidence(
  samples: SegmentTrajectorySample[],
  points: GpsPoint[],
): SegmentLapRecord["gpsConfidence"] {
  const sourcePoints = [...new Set(samples.map((sample) => sample.sourceIndex))]
    .map((index) => points[index])
    .filter((point): point is GpsPoint => Boolean(point));
  return gpsEvidenceConfidence(sourcePoints);
}

function minimumRecord(
  records: SegmentLapRecord[],
  value: (record: SegmentLapRecord) => number | undefined,
): SegmentLapRecord | undefined {
  return records.filter((record) => record.eligibleForBest && value(record) !== undefined)
    .sort((left, right) => value(left)! - value(right)!)[0];
}

function orderedClampedRange(left: number, right: number, maximum: number): ScopeRange {
  const start = Math.min(finiteOr(left, 0), finiteOr(right, maximum));
  const end = Math.max(finiteOr(left, 0), finiteOr(right, maximum));
  return {
    startDistanceMeters: Math.max(0, Math.min(maximum, start)),
    endDistanceMeters: Math.max(0, Math.min(maximum, end)),
  };
}

function maximumDefined(values: number[]): number | undefined {
  return values.length ? Math.max(...values) : undefined;
}

function signedHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
