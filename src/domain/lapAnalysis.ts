import type { LineString, Position } from "geojson";
import { generateAutomaticSections } from "./automaticSections";
import { bearingDegrees, coordinateOf, haversineMeters, normalizeDegrees, routeDistanceMeters } from "./geometry";
import { detectGateCrossings, elapsedSecondsAt } from "./lapDetection";
import type {
  GpsPoint,
  CornerAnalysisResult,
  LapComparisonSample,
  LapDistanceSample,
  LapResult,
  TimingSectorAnalysisResult,
  TimingSectorResult,
  TrackSection,
  TrackProfileV1,
} from "./types";

export function lapDistanceSamples(points: GpsPoint[], lap: LapResult): LapDistanceSample[] {
  const selected = points.slice(lap.startIndex, lap.endIndex + 1);
  let distanceMeters = 0;
  return selected.map((point, offset) => {
    if (offset > 0) {
      distanceMeters += haversineMeters(coordinateOf(selected[offset - 1]), coordinateOf(point));
    }
    return {
      distanceMeters,
      elapsedSeconds: elapsedSecondsAt(points, lap.startIndex + offset) - lap.start.elapsedSeconds,
      speedKmh: point.speedKmh,
      latitude: point.latitude,
      longitude: point.longitude,
      sourceIndex: lap.startIndex + offset,
    };
  });
}

export function resampleLapByDistance(
  points: GpsPoint[],
  lap: LapResult,
  spacingMeters = 5,
): LapDistanceSample[] {
  const samples = lapDistanceSamples(points, lap);
  const totalDistance = samples.at(-1)?.distanceMeters ?? 0;
  if (samples.length < 2 || totalDistance <= 0 || spacingMeters <= 0) {
    return samples;
  }
  const result: LapDistanceSample[] = [];
  let rightIndex = 1;
  for (let distance = 0; distance < totalDistance; distance += spacingMeters) {
    while (rightIndex < samples.length - 1 && samples[rightIndex].distanceMeters < distance) {
      rightIndex += 1;
    }
    result.push(interpolateSample(samples[rightIndex - 1], samples[rightIndex], distance));
  }
  result.push(samples[samples.length - 1]);
  return result;
}

export function lapLineString(
  points: GpsPoint[],
  lap: LapResult,
  spacingMeters = 5,
): LineString | undefined {
  const coordinates = resampleLapByDistance(points, lap, spacingMeters)
    .map((sample): Position => [sample.longitude, sample.latitude]);
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : undefined;
}

export interface TrackSectionGeometry extends Pick<TrackSection, "id" | "name" | "kind"> {
  line: LineString;
}

export function deriveTrackSectionGeometry(
  centerline: LineString,
  sections: TrackSection[],
): TrackSectionGeometry[] {
  if (centerline.coordinates.length < 2 || !sections.length) return [];
  const distances = cumulativeDistances(centerline.coordinates);
  const totalDistance = distances.at(-1) ?? 0;
  return sections.flatMap((section) => {
    const startDistance = Math.min(totalDistance, Math.max(0, section.startDistanceMeters));
    const endDistance = Math.min(totalDistance, Math.max(0, section.endDistanceMeters));
    if (endDistance <= startDistance) return [];
    const line = lineBetweenDistances(centerline.coordinates, distances, startDistance, endDistance);
    return line ? [{ id: section.id, name: section.name, kind: section.kind, line }] : [];
  });
}

export function compareLapToReference(
  points: GpsPoint[],
  lap: LapResult,
  reference: LapResult,
  spacingMeters = 5,
): LapComparisonSample[] {
  const lapSamples = resampleLapByDistance(points, lap, spacingMeters);
  const referenceSamples = resampleLapByDistance(points, reference, spacingMeters);
  if (!lapSamples.length || !referenceSamples.length) {
    return [];
  }
  return lapSamples.map((sample) => {
    const referenceDistance =
      (sample.distanceMeters / Math.max(1, lapSamples.at(-1)?.distanceMeters ?? 1)) *
      (referenceSamples.at(-1)?.distanceMeters ?? 0);
    const referenceSample = sampleAtDistance(referenceSamples, referenceDistance);
    return {
      ...sample,
      referenceElapsedSeconds: referenceSample.elapsedSeconds,
      deltaSeconds: sample.elapsedSeconds - referenceSample.elapsedSeconds,
    };
  });
}

export function analyzeTimingSectors(
  points: GpsPoint[],
  laps: LapResult[],
  profile: TrackProfileV1,
  includePartialLapSectors: boolean,
): TimingSectorResult[] {
  return analyzeTimingSectorsDetailed(points, laps, profile, includePartialLapSectors).sectors;
}

export function analyzeTimingSectorsDetailed(
  points: GpsPoint[],
  laps: LapResult[],
  profile: TrackProfileV1,
  includePartialLapSectors: boolean,
): TimingSectorAnalysisResult {
  if (!profile.startFinish || !profile.sectorGates.length) {
    return { sectors: [], missedSectorLapIds: [], warnings: [] };
  }
  const gates = [profile.startFinish, ...profile.sectorGates];
  const crossings = new Map(profile.sectorGates.map((gate) => [gate.id, detectGateCrossings(points, gate)]));
  const results: TimingSectorResult[] = [];
  const missedSectorLapIds: string[] = [];
  for (const lap of laps) {
    if (lap.validity !== "valid") {
      continue;
    }
    const events = profile.sectorGates.flatMap((gate, sectorOffset) => {
      const gateIndex = sectorOffset + 1;
      const withinLap = (crossings.get(gate.id) ?? [])
        .filter((boundary) => boundary.elapsedSeconds >= lap.start.elapsedSeconds && boundary.elapsedSeconds <= lap.end.elapsedSeconds)
        .map((boundary) => ({ gate, gateIndex, boundary }));
      return withinLap;
    });
    if (lap.start.source !== "session-start") {
      events.push({ gate: profile.startFinish, gateIndex: 0, boundary: lap.start });
    }
    if (lap.end.source !== "session-end") {
      events.push({ gate: profile.startFinish, gateIndex: 0, boundary: lap.end });
    }
    events.sort((left, right) => left.boundary.elapsedSeconds - right.boundary.elapsedSeconds);
    const wrongOrder = events.slice(1).some(
      (event, index) => event.gateIndex !== (events[index].gateIndex + 1) % gates.length,
    );
    const incompleteCompleteLap = lap.completion === "complete" && events.length !== gates.length + 1;
    if (wrongOrder || incompleteCompleteLap) {
      missedSectorLapIds.push(lap.id);
    }
    for (let index = 1; index < events.length; index += 1) {
      const start = events[index - 1];
      const end = events[index];
      if (end.gateIndex !== (start.gateIndex + 1) % gates.length) {
        continue;
      }
      const sectorIndex = start.gateIndex;
      results.push({
        id: `${lap.id}-sector-${sectorIndex}`,
        lapId: lap.id,
        sectorIndex,
        name: sectorName(start.gate.name, end.gate.name, sectorIndex),
        startGateId: start.gate.id,
        endGateId: end.gate.id,
        startSeconds: start.boundary.elapsedSeconds,
        endSeconds: end.boundary.elapsedSeconds,
        durationSeconds: end.boundary.elapsedSeconds - start.boundary.elapsedSeconds,
        fromPartialLap: lap.completion !== "complete",
        eligibleForBest: lap.completion === "complete" || includePartialLapSectors,
      });
    }
  }
  return {
    sectors: dedupeSectorResults(results),
    missedSectorLapIds,
    warnings: missedSectorLapIds.length
      ? ["One or more laps crossed timing sector gates in the wrong order."]
      : [],
  };
}

export function theoreticalBestSeconds(results: TimingSectorResult[], sectorCount: number): number | undefined {
  if (!Number.isInteger(sectorCount) || sectorCount <= 0) {
    return undefined;
  }
  const bestBySector = new Map<number, number>();
  for (const result of results) {
    if (!result.eligibleForBest || result.durationSeconds <= 0) {
      continue;
    }
    const current = bestBySector.get(result.sectorIndex);
    bestBySector.set(result.sectorIndex, current === undefined ? result.durationSeconds : Math.min(current, result.durationSeconds));
  }
  if (bestBySector.size !== sectorCount) {
    return undefined;
  }
  return [...bestBySector.values()].reduce((sum, value) => sum + value, 0);
}

export function proposeTrackSections(centerline: LineString): TrackSection[] {
  const coordinates = centerline.coordinates;
  if (coordinates.length < 2) {
    return [];
  }
  const distances = cumulativeDistances(coordinates);
  return generateAutomaticSections(coordinates.map((coordinate, index) => ({
    distanceMeters: distances[index],
    elapsedSeconds: 0,
    speedKmh: 0,
    longitude: coordinate[0],
    latitude: coordinate[1],
    sourceIndex: index,
  })));
}

export function analyzeCorners(
  points: GpsPoint[],
  lap: LapResult,
  sections: TrackSection[],
): CornerAnalysisResult[] {
  const samples = lapDistanceSamples(points, lap);
  if (samples.length < 2) {
    return [];
  }
  return sections
    .filter((section) => section.kind !== "straight")
    .map((section): CornerAnalysisResult | undefined => {
      const selected = samples.filter(
        (sample) => sample.distanceMeters >= section.startDistanceMeters && sample.distanceMeters <= section.endDistanceMeters,
      );
      if (selected.length < 2) {
        return undefined;
      }
      return {
        lapId: lap.id,
        sectionId: section.id,
        name: section.name,
        kind: section.kind,
        durationSeconds: selected.at(-1)!.elapsedSeconds - selected[0].elapsedSeconds,
        entrySpeedKmh: selected[0].speedKmh,
        minimumSpeedKmh: Math.min(...selected.map((sample) => sample.speedKmh)),
        exitSpeedKmh: selected.at(-1)!.speedKmh,
        maxLateralG: maximumLateralG(selected),
        maxDecelerationG: maximumDerivedDecelerationG(selected),
      };
    })
    .filter((result): result is CornerAnalysisResult => Boolean(result));
}

function maximumDerivedDecelerationG(samples: LapDistanceSample[]): number | undefined {
  let maximum = 0;
  let found = false;
  for (let index = 1; index < samples.length; index += 1) {
    const elapsed = samples[index].elapsedSeconds - samples[index - 1].elapsedSeconds;
    if (elapsed <= 0) continue;
    const accelerationMps2 = ((samples[index].speedKmh - samples[index - 1].speedKmh) / 3.6) / elapsed;
    if (accelerationMps2 < 0) {
      found = true;
      maximum = Math.max(maximum, -accelerationMps2 / 9.80665);
    }
  }
  return found ? maximum : 0;
}

function maximumLateralG(samples: LapDistanceSample[]): number | undefined {
  if (samples.length < 3) return undefined;
  let maximum = 0;
  let found = false;
  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous: Position = [samples[index - 1].longitude, samples[index - 1].latitude];
    const current: Position = [samples[index].longitude, samples[index].latitude];
    const next: Position = [samples[index + 1].longitude, samples[index + 1].latitude];
    const incomingDistance = haversineMeters(previous, current);
    const outgoingDistance = haversineMeters(current, next);
    const span = (incomingDistance + outgoingDistance) / 2;
    if (span <= 0) continue;
    const turnRadians = Math.abs(signedHeadingDelta(bearingDegrees(previous, current), bearingDegrees(current, next))) * Math.PI / 180;
    const speedMps = samples[index].speedKmh / 3.6;
    found = true;
    maximum = Math.max(maximum, speedMps * speedMps * turnRadians / span / 9.80665);
  }
  return found ? maximum : undefined;
}

function interpolateSample(left: LapDistanceSample, right: LapDistanceSample, distanceMeters: number): LapDistanceSample {
  const span = right.distanceMeters - left.distanceMeters;
  const ratio = span <= 0 ? 0 : (distanceMeters - left.distanceMeters) / span;
  return {
    distanceMeters,
    elapsedSeconds: left.elapsedSeconds + (right.elapsedSeconds - left.elapsedSeconds) * ratio,
    speedKmh: left.speedKmh + (right.speedKmh - left.speedKmh) * ratio,
    latitude: left.latitude + (right.latitude - left.latitude) * ratio,
    longitude: left.longitude + (right.longitude - left.longitude) * ratio,
    sourceIndex: ratio < 0.5 ? left.sourceIndex : right.sourceIndex,
  };
}

function sampleAtDistance(samples: LapDistanceSample[], distance: number): LapDistanceSample {
  if (distance <= 0) {
    return samples[0];
  }
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].distanceMeters >= distance) {
      return interpolateSample(samples[index - 1], samples[index], distance);
    }
  }
  return samples[samples.length - 1];
}

function sectorName(startName: string, endName: string, index: number): string {
  return startName && endName ? `${startName} → ${endName}` : `Sector ${index + 1}`;
}

function dedupeSectorResults(results: TimingSectorResult[]): TimingSectorResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.lapId}:${result.startGateId}:${result.startSeconds.toFixed(3)}:${result.endGateId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function cumulativeDistances(coordinates: Position[]): number[] {
  return coordinates.map((_, index) => routeDistanceMeters(coordinates.slice(0, index + 1)));
}

function lineBetweenDistances(
  coordinates: Position[],
  distances: number[],
  startDistance: number,
  endDistance: number,
): LineString | undefined {
  const selected: Position[] = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const segmentStart = distances[index - 1];
    const segmentEnd = distances[index];
    if (segmentEnd < startDistance || segmentStart > endDistance || segmentEnd <= segmentStart) continue;
    const visibleStart = Math.max(segmentStart, startDistance);
    const visibleEnd = Math.min(segmentEnd, endDistance);
    if (visibleEnd < visibleStart) continue;
    const span = segmentEnd - segmentStart;
    appendCoordinate(selected, interpolatePosition(coordinates[index - 1], coordinates[index], (visibleStart - segmentStart) / span));
    appendCoordinate(selected, interpolatePosition(coordinates[index - 1], coordinates[index], (visibleEnd - segmentStart) / span));
  }
  return selected.length >= 2 ? { type: "LineString", coordinates: selected } : undefined;
}

function interpolatePosition(left: Position, right: Position, ratio: number): Position {
  return [
    left[0] + (right[0] - left[0]) * ratio,
    left[1] + (right[1] - left[1]) * ratio,
  ];
}

function appendCoordinate(coordinates: Position[], coordinate: Position): void {
  const previous = coordinates.at(-1);
  if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) coordinates.push(coordinate);
}

function signedHeadingDelta(from: number, to: number): number {
  const normalized = normalizeDegrees(to - from);
  return normalized > 180 ? normalized - 360 : normalized;
}
