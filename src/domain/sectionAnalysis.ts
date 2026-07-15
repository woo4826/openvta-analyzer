import type { LineString, Position } from "geojson";
import { bearingDegrees, haversineMeters, projectCoordinateToLineProgress, routeDistanceMeters } from "./geometry";
import { lapDistanceSamples } from "./lapAnalysis";
import type {
  GpsPoint,
  LapComparisonSample,
  LapDistanceSample,
  LapResult,
  LapSectionResult,
  TrackSection,
} from "./types";

const GRAVITY_MPS2 = 9.80665;
const PROGRESS_TOLERANCE_METERS = 1;
const BACKWARD_NOISE_METERS = 20;
const PROGRESS_JUMP_TOLERANCE_METERS = 15;
const MAX_PROJECTED_TO_DRIVEN_RATIO = 3;

export function analyzeLapSections(
  points: GpsPoint[],
  laps: LapResult[],
  analysisLine: LineString,
  sections: TrackSection[],
  includePartialLapSections: boolean,
): LapSectionResult[] {
  const totalDistanceMeters = routeDistanceMeters(analysisLine.coordinates);
  if (totalDistanceMeters <= 0 || !sections.length) return [];

  const results = laps.flatMap((lap): LapSectionResult[] => {
    if (lap.completion === "partial-both" || lap.validity === "excluded") return [];
    const samples = lapProgressSamples(points, lap, analysisLine);
    if (samples.length < 2) return [];
    const observedStart = samples[0].distanceMeters;
    const observedEnd = samples.at(-1)!.distanceMeters;
    return sections.flatMap((section): LapSectionResult[] => {
      const startDistanceMeters = Math.max(0, Math.min(totalDistanceMeters, section.startDistanceMeters));
      const endDistanceMeters = Math.max(0, Math.min(totalDistanceMeters, section.endDistanceMeters));
      if (
        endDistanceMeters <= startDistanceMeters ||
        startDistanceMeters < observedStart - PROGRESS_TOLERANCE_METERS ||
        endDistanceMeters > observedEnd + PROGRESS_TOLERANCE_METERS ||
        !hasPlausibleProgressContinuity(samples, startDistanceMeters, endDistanceMeters)
      ) {
        return [];
      }
      const scoped = samplesWithin(samples, startDistanceMeters, endDistanceMeters);
      if (scoped.length < 2) return [];
      const durationSeconds = scoped.at(-1)!.elapsedSeconds - scoped[0].elapsedSeconds;
      if (durationSeconds <= 0) return [];
      const fromPartialLap = lap.completion !== "complete";
      return [{
        id: `${lap.id}-${section.id}`,
        lapId: lap.id,
        sectionId: section.id,
        name: section.name,
        kind: section.kind,
        durationSeconds,
        entrySpeedKmh: scoped[0].speedKmh,
        minimumSpeedKmh: Math.min(...scoped.map((sample) => sample.speedKmh)),
        averageSpeedKmh: timeWeightedAverageSpeed(scoped),
        maximumSpeedKmh: Math.max(...scoped.map((sample) => sample.speedKmh)),
        exitSpeedKmh: scoped.at(-1)!.speedKmh,
        maxLateralG: maximumLateralG(scoped),
        maxDecelerationG: maximumDerivedDecelerationG(scoped),
        fromPartialLap,
        eligibleForBest: lap.validity === "valid" && (!fromPartialLap || includePartialLapSections),
      }];
    });
  });

  const bestBySection = new Map<string, number>();
  for (const result of results) {
    if (!result.eligibleForBest) continue;
    const best = bestBySection.get(result.sectionId);
    bestBySection.set(result.sectionId, best === undefined ? result.durationSeconds : Math.min(best, result.durationSeconds));
  }
  return results.map((result) => {
    const best = bestBySection.get(result.sectionId);
    return best === undefined ? result : { ...result, deltaBestSeconds: result.durationSeconds - best };
  });
}

function hasPlausibleProgressContinuity(
  samples: LapDistanceSample[],
  startDistanceMeters: number,
  endDistanceMeters: number,
): boolean {
  for (let index = 1; index < samples.length; index += 1) {
    const left = samples[index - 1];
    const right = samples[index];
    if (right.distanceMeters <= startDistanceMeters || left.distanceMeters >= endDistanceMeters) continue;
    const projectedAdvance = Math.max(0, right.distanceMeters - left.distanceMeters);
    const drivenDistance = haversineMeters(
      [left.longitude, left.latitude],
      [right.longitude, right.latitude],
    );
    if (projectedAdvance > drivenDistance * MAX_PROJECTED_TO_DRIVEN_RATIO + PROGRESS_JUMP_TOLERANCE_METERS) {
      return false;
    }
  }
  return true;
}

export function scopedLapComparison(
  points: GpsPoint[],
  lap: LapResult,
  reference: LapResult | undefined,
  analysisLine: LineString,
  section?: TrackSection,
  spacingMeters = 5,
): LapComparisonSample[] {
  const lapSamples = lapProgressSamples(points, lap, analysisLine);
  const referenceSamples = reference ? lapProgressSamples(points, reference, analysisLine) : undefined;
  if (lapSamples.length < 2 || (reference && (!referenceSamples || referenceSamples.length < 2))) return [];

  const lineLength = routeDistanceMeters(analysisLine.coordinates);
  const requestedStart = section?.startDistanceMeters ?? 0;
  const requestedEnd = section?.endDistanceMeters ?? lineLength;
  const overlapStart = Math.max(
    requestedStart,
    lapSamples[0].distanceMeters,
    referenceSamples?.[0].distanceMeters ?? requestedStart,
  );
  const overlapEnd = Math.min(
    requestedEnd,
    lapSamples.at(-1)!.distanceMeters,
    referenceSamples?.at(-1)?.distanceMeters ?? requestedEnd,
  );
  if (
    overlapEnd <= overlapStart ||
    (section && (
      overlapStart > requestedStart + PROGRESS_TOLERANCE_METERS ||
      overlapEnd < requestedEnd - PROGRESS_TOLERANCE_METERS
    ))
  ) {
    return [];
  }

  const start = section ? requestedStart : overlapStart;
  const end = section ? requestedEnd : overlapEnd;
  const safeSpacing = Number.isFinite(spacingMeters) && spacingMeters > 0 ? spacingMeters : 5;
  const distances: number[] = [];
  for (let distance = start; distance < end; distance += safeSpacing) distances.push(distance);
  distances.push(end);
  const lapStart = sampleAtProgress(lapSamples, start);
  const referenceStart = referenceSamples ? sampleAtProgress(referenceSamples, start) : undefined;
  return distances.map((distanceMeters) => {
    const sample = sampleAtProgress(lapSamples, distanceMeters);
    const referenceSample = referenceSamples ? sampleAtProgress(referenceSamples, distanceMeters) : undefined;
    const elapsedSeconds = sample.elapsedSeconds - lapStart.elapsedSeconds;
    const referenceElapsedSeconds = referenceSample && referenceStart
      ? referenceSample.elapsedSeconds - referenceStart.elapsedSeconds
      : elapsedSeconds;
    return {
      ...sample,
      distanceMeters: distanceMeters - start,
      elapsedSeconds,
      referenceElapsedSeconds,
      deltaSeconds: elapsedSeconds - referenceElapsedSeconds,
    };
  });
}

export function automaticTheoreticalBestSeconds(
  results: LapSectionResult[],
  sectionCount: number,
): number | undefined {
  if (!Number.isInteger(sectionCount) || sectionCount <= 0) return undefined;
  const bestBySection = new Map<string, number>();
  for (const result of results) {
    if (!result.eligibleForBest || result.durationSeconds <= 0) continue;
    const best = bestBySection.get(result.sectionId);
    bestBySection.set(result.sectionId, best === undefined ? result.durationSeconds : Math.min(best, result.durationSeconds));
  }
  if (bestBySection.size !== sectionCount) return undefined;
  return [...bestBySection.values()].reduce((sum, durationSeconds) => sum + durationSeconds, 0);
}

function lapProgressSamples(points: GpsPoint[], lap: LapResult, analysisLine: LineString): LapDistanceSample[] {
  if (lap.completion === "partial-both") return [];
  const totalDistanceMeters = routeDistanceMeters(analysisLine.coordinates);
  if (totalDistanceMeters <= 0) return [];
  const driven = lapDistanceSamples(points, lap);
  if (!driven.length) return [];
  const startPoint = points[Math.max(0, Math.min(points.length - 1, lap.startIndex))];
  const endPoint = points[Math.max(0, Math.min(points.length - 1, lap.endIndex))];
  const durationSeconds = Math.max(0, lap.end.elapsedSeconds - lap.start.elapsedSeconds);
  const input: LapDistanceSample[] = [
    boundarySample(lap.start.coordinate, 0, startPoint, lap.startIndex),
    ...driven,
    boundarySample(lap.end.coordinate, durationSeconds, endPoint, lap.endIndex),
  ].sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  const rawProgress = input.map((sample) =>
    projectCoordinateToLineProgress([sample.longitude, sample.latitude], analysisLine).distanceMeters);
  if (lap.start.source !== "session-start") rawProgress[0] = 0;
  if (lap.end.source !== "session-end") rawProgress[rawProgress.length - 1] = totalDistanceMeters;
  const unwrapped = unwrapProgress(rawProgress, totalDistanceMeters, lap.start.source !== "session-start");
  if (lap.end.source !== "session-end") unwrapped[unwrapped.length - 1] = totalDistanceMeters;
  return input.map((sample, index) => ({
    ...sample,
    distanceMeters: Math.min(totalDistanceMeters, Math.max(0, unwrapped[index])),
  }));
}

function unwrapProgress(raw: number[], totalDistanceMeters: number, anchoredStart: boolean): number[] {
  if (!raw.length) return [];
  const result: number[] = [];
  let previous = anchoredStart ? 0 : raw[0];
  for (let index = 0; index < raw.length; index += 1) {
    if (index === 0 && !anchoredStart) {
      result.push(previous);
      continue;
    }
    const candidates = [raw[index] - totalDistanceMeters, raw[index], raw[index] + totalDistanceMeters]
      .filter((candidate) => candidate >= previous - BACKWARD_NOISE_METERS);
    const selected = (candidates.length ? candidates : [raw[index]])
      .reduce((best, candidate) => Math.abs(candidate - previous) < Math.abs(best - previous) ? candidate : best);
    previous = Math.max(previous, selected);
    result.push(previous);
  }
  return result;
}

function boundarySample(
  coordinate: Position,
  elapsedSeconds: number,
  nearestPoint: GpsPoint | undefined,
  sourceIndex: number,
): LapDistanceSample {
  return {
    distanceMeters: 0,
    elapsedSeconds,
    speedKmh: nearestPoint?.speedKmh ?? 0,
    longitude: coordinate[0],
    latitude: coordinate[1],
    sourceIndex,
  };
}

function samplesWithin(samples: LapDistanceSample[], start: number, end: number): LapDistanceSample[] {
  return [
    sampleAtProgress(samples, start),
    ...samples.filter((sample) => sample.distanceMeters > start && sample.distanceMeters < end),
    sampleAtProgress(samples, end),
  ];
}

function sampleAtProgress(samples: LapDistanceSample[], distanceMeters: number): LapDistanceSample {
  if (distanceMeters <= samples[0].distanceMeters) return { ...samples[0], distanceMeters };
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].distanceMeters >= distanceMeters) {
      return interpolateSample(samples[index - 1], samples[index], distanceMeters);
    }
  }
  return { ...samples.at(-1)!, distanceMeters };
}

function interpolateSample(
  left: LapDistanceSample,
  right: LapDistanceSample,
  distanceMeters: number,
): LapDistanceSample {
  const span = right.distanceMeters - left.distanceMeters;
  const ratio = span <= 0 ? 0 : (distanceMeters - left.distanceMeters) / span;
  return {
    distanceMeters,
    elapsedSeconds: interpolate(left.elapsedSeconds, right.elapsedSeconds, ratio),
    speedKmh: interpolate(left.speedKmh, right.speedKmh, ratio),
    longitude: interpolate(left.longitude, right.longitude, ratio),
    latitude: interpolate(left.latitude, right.latitude, ratio),
    sourceIndex: ratio < 0.5 ? left.sourceIndex : right.sourceIndex,
  };
}

function timeWeightedAverageSpeed(samples: LapDistanceSample[]): number {
  let weightedSpeed = 0;
  let duration = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const elapsed = samples[index].elapsedSeconds - samples[index - 1].elapsedSeconds;
    if (elapsed <= 0) continue;
    weightedSpeed += (samples[index - 1].speedKmh + samples[index].speedKmh) / 2 * elapsed;
    duration += elapsed;
  }
  return duration > 0 ? weightedSpeed / duration : samples[0]?.speedKmh ?? 0;
}

function maximumDerivedDecelerationG(samples: LapDistanceSample[]): number | undefined {
  let maximum = 0;
  let found = false;
  for (let index = 1; index < samples.length; index += 1) {
    const elapsed = samples[index].elapsedSeconds - samples[index - 1].elapsedSeconds;
    if (elapsed <= 0) continue;
    const accelerationMps2 = ((samples[index].speedKmh - samples[index - 1].speedKmh) / 3.6) / elapsed;
    if (accelerationMps2 < 0) {
      maximum = Math.max(maximum, -accelerationMps2 / GRAVITY_MPS2);
      found = true;
    }
  }
  return found ? maximum : 0;
}

function maximumLateralG(samples: LapDistanceSample[]): number | undefined {
  let maximum = 0;
  let found = false;
  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous: Position = [samples[index - 1].longitude, samples[index - 1].latitude];
    const current: Position = [samples[index].longitude, samples[index].latitude];
    const next: Position = [samples[index + 1].longitude, samples[index + 1].latitude];
    const span = (routeDistanceMeters([previous, current]) + routeDistanceMeters([current, next])) / 2;
    if (span <= 0) continue;
    const turnRadians = Math.abs(signedHeadingDelta(bearingDegrees(previous, current), bearingDegrees(current, next))) * Math.PI / 180;
    const speedMps = samples[index].speedKmh / 3.6;
    maximum = Math.max(maximum, speedMps * speedMps * turnRadians / span / GRAVITY_MPS2);
    found = true;
  }
  return found ? maximum : undefined;
}

function signedHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function interpolate(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}
