import type { LineString, Position } from "geojson";
import { bearingDegrees, coordinateOf, haversineMeters, normalizeDegrees, routeDistanceMeters } from "./geometry";
import { detectGateCrossings, elapsedSecondsAt } from "./lapDetection";
import type {
  GpsPoint,
  CornerAnalysisResult,
  LapComparisonSample,
  LapDistanceSample,
  LapResult,
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
  if (!profile.startFinish || !profile.sectorGates.length) {
    return [];
  }
  const gates = [profile.startFinish, ...profile.sectorGates];
  const crossings = new Map(gates.map((gate) => [gate.id, detectGateCrossings(points, gate)]));
  const results: TimingSectorResult[] = [];
  for (const lap of laps) {
    if (lap.validity !== "valid") {
      continue;
    }
    const events = gates.flatMap((gate, gateIndex) => {
      const withinLap = (crossings.get(gate.id) ?? [])
        .filter((boundary) => boundary.elapsedSeconds >= lap.start.elapsedSeconds && boundary.elapsedSeconds <= lap.end.elapsedSeconds)
        .map((boundary) => ({ gate, gateIndex, boundary }));
      return withinLap;
    });
    if (lap.completion === "complete") {
      events.push({ gate: profile.startFinish, gateIndex: 0, boundary: lap.start });
      events.push({ gate: profile.startFinish, gateIndex: 0, boundary: lap.end });
    }
    events.sort((left, right) => left.boundary.elapsedSeconds - right.boundary.elapsedSeconds);
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
  return dedupeSectorResults(results);
}

export function theoreticalBestSeconds(results: TimingSectorResult[], sectorCount: number): number | undefined {
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
  if (coordinates.length < 5) {
    return [];
  }
  const distances = cumulativeDistances(coordinates);
  const totalDistance = distances.at(-1) ?? 0;
  const curved = coordinates.map((_, index) => {
    if (index === 0 || index === coordinates.length - 1) {
      return 0;
    }
    const incoming = bearingDegrees(coordinates[index - 1], coordinates[index]);
    const outgoing = bearingDegrees(coordinates[index], coordinates[index + 1]);
    const turn = signedHeadingDelta(incoming, outgoing);
    const span = Math.max(1, haversineMeters(coordinates[index - 1], coordinates[index + 1]));
    return turn / span;
  });
  const smoothed = curved.map((_, index) => averageWindow(curved, index, 2));
  const minimumCurvature = 0.08;
  const groups: Array<{ start: number; end: number; sign: -1 | 1 }> = [];
  let active: { start: number; end: number; sign: -1 | 1 } | undefined;
  for (let index = 1; index < smoothed.length - 1; index += 1) {
    const value = smoothed[index];
    const sign: -1 | 1 = value < 0 ? -1 : 1;
    if (Math.abs(value) < minimumCurvature) {
      if (active) groups.push(active);
      active = undefined;
      continue;
    }
    if (!active || active.sign !== sign) {
      if (active) groups.push(active);
      active = { start: index, end: index, sign };
    } else {
      active.end = index;
    }
  }
  if (active) groups.push(active);

  const corners = groups
    .map((group, index): TrackSection => ({
      id: `corner-${index + 1}`,
      name: `Corner ${index + 1}`,
      kind: group.sign > 0 ? "corner-right" : "corner-left",
      startDistanceMeters: distances[Math.max(0, group.start - 1)],
      endDistanceMeters: distances[Math.min(distances.length - 1, group.end + 1)],
    }))
    .filter((section) => section.endDistanceMeters - section.startDistanceMeters >= 15);

  const result: TrackSection[] = [];
  let cursor = 0;
  for (const corner of corners) {
    if (corner.startDistanceMeters - cursor >= 30) {
      result.push({
        id: `straight-${result.length + 1}`,
        name: `Straight ${result.filter((section) => section.kind === "straight").length + 1}`,
        kind: "straight",
        startDistanceMeters: cursor,
        endDistanceMeters: corner.startDistanceMeters,
      });
    }
    result.push(corner);
    cursor = corner.endDistanceMeters;
  }
  if (totalDistance - cursor >= 30) {
    result.push({
      id: `straight-${result.length + 1}`,
      name: `Straight ${result.filter((section) => section.kind === "straight").length + 1}`,
      kind: "straight",
      startDistanceMeters: cursor,
      endDistanceMeters: totalDistance,
    });
  }
  return result;
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
    .map((section) => {
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
      } satisfies CornerAnalysisResult;
    })
    .filter((result): result is CornerAnalysisResult => Boolean(result));
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

function signedHeadingDelta(from: number, to: number): number {
  const normalized = normalizeDegrees(to - from);
  return normalized > 180 ? normalized - 360 : normalized;
}

function averageWindow(values: number[], center: number, radius: number): number {
  const selected = values.slice(Math.max(0, center - radius), Math.min(values.length, center + radius + 1));
  return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
}
