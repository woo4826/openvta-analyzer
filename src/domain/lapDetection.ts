import {
  bearingDegrees,
  coordinateOf,
  gateCenter,
  gateLine,
  haversineMeters,
  interpolateCoordinate,
  routeDistanceMeters,
  toLocalMeters,
} from "./geometry";
import type {
  GpsPoint,
  LapBoundaryOverride,
  LapDetectionResult,
  LapFlag,
  LapResult,
  LapValidityOverride,
  TimedBoundary,
  TrackGate,
} from "./types";

export interface LapDetectionOptions {
  boundaryOverrides?: LapBoundaryOverride[];
  validityOverrides?: LapValidityOverride[];
  minimumRearmSeconds?: number;
  minimumRearmDistanceMeters?: number;
}

export interface StartFinishInferenceOptions {
  widthMeters?: number;
  maximumCandidates?: number;
}

type GateCrossingDirection = "forward" | "reverse";

interface GateCrossingEvent extends TimedBoundary {
  direction: GateCrossingDirection;
}

export function createGateFromRoutePoint(points: GpsPoint[], selectedIndex: number, widthMeters = 50): TrackGate | undefined {
  if (!points.length || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= points.length) {
    return undefined;
  }
  const selected = points[selectedIndex];
  const previous = distinctPoint(points, selectedIndex, -1);
  const next = distinctPoint(points, selectedIndex, 1);
  let heading: number | undefined;
  if (previous && next) {
    heading = bearingDegrees(coordinateOf(previous), coordinateOf(next));
  } else if (next) {
    heading = bearingDegrees(coordinateOf(selected), coordinateOf(next));
  } else if (previous) {
    heading = bearingDegrees(coordinateOf(previous), coordinateOf(selected));
  } else if (Number.isFinite(selected.bearingDegrees)) {
    heading = selected.bearingDegrees;
  }
  if (heading === undefined) {
    return undefined;
  }
  const center = coordinateOf(selected);
  return {
    id: "start-finish",
    name: "Start / Finish",
    kind: "start-finish",
    line: gateLine(center, heading, widthMeters),
    forwardBearingDegrees: heading,
    widthMeters,
  };
}

/**
 * Finds a repeatable start/finish line directly from a closed-course recording.
 * Candidates that do not produce at least one complete lap are ignored. Among
 * the remaining candidates we prefer the dominant lap count across the route,
 * consistent lap times and distances, and finally a faster (usually straighter)
 * crossing point. The dominant-count rule avoids treating a self-intersection as
 * two artificial laps per real lap.
 */
export function inferStartFinishGate(
  points: GpsPoint[],
  options: StartFinishInferenceOptions = {},
): TrackGate | undefined {
  if (points.length < 4) return undefined;
  const maximumCandidates = Math.min(96, Math.max(8, Math.trunc(options.maximumCandidates ?? 64)));
  const widthMeters = Math.min(100, Math.max(20, options.widthMeters ?? 50));
  const indices = sampledCandidateIndices(points.length, maximumCandidates);
  return selectInferredGate(indices.flatMap((pointIndex) => {
    const candidate = evaluateInferenceCandidate(points, pointIndex, widthMeters);
    return candidate ? [candidate] : [];
  }));
}

/**
 * Browser-friendly start/finish inference. Candidate evaluation is split into
 * short batches so a large recording cannot block the first interactive paint.
 */
export async function inferStartFinishGateAsync(
  points: GpsPoint[],
  options: StartFinishInferenceOptions = {},
): Promise<TrackGate | undefined> {
  if (points.length < 4) return undefined;
  const maximumCandidates = Math.min(96, Math.max(8, Math.trunc(options.maximumCandidates ?? 64)));
  const widthMeters = Math.min(100, Math.max(20, options.widthMeters ?? 50));
  const indices = sampledCandidateIndices(points.length, maximumCandidates);
  const candidates: InferredGateCandidate[] = [];
  for (let index = 0; index < indices.length; index += 1) {
    const candidate = evaluateInferenceCandidate(points, indices[index], widthMeters);
    if (candidate) candidates.push(candidate);
    if (index % 4 === 3) await yieldToBrowser();
  }
  return selectInferredGate(candidates);
}

export function detectGateCrossings(
  points: GpsPoint[],
  gate: TrackGate,
  options: Pick<LapDetectionOptions, "minimumRearmSeconds" | "minimumRearmDistanceMeters"> = {},
): TimedBoundary[] {
  return detectGateCrossingEvents(points, gate, options)
    .filter((event) => event.direction === "forward")
    .map(toTimedBoundary);
}

function detectGateCrossingEvents(
  points: GpsPoint[],
  gate: TrackGate,
  options: Pick<LapDetectionOptions, "minimumRearmSeconds" | "minimumRearmDistanceMeters"> = {},
): GateCrossingEvent[] {
  if (points.length < 2) {
    return [];
  }
  const minimumRearmSeconds = options.minimumRearmSeconds ?? 5;
  const minimumRearmDistanceMeters = options.minimumRearmDistanceMeters ?? Math.max(50, gate.widthMeters);
  const center = gateCenter(gate);
  const headingRadians = (gate.forwardBearingDegrees * Math.PI) / 180;
  const forward = { x: Math.sin(headingRadians), y: Math.cos(headingRadians) };
  const lateral = { x: -forward.y, y: forward.x };
  const halfWidth = gate.widthMeters / 2;
  const events: GateCrossingEvent[] = [];
  let armed = true;
  let lastCrossingSeconds = Number.NEGATIVE_INFINITY;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const previousSeconds = elapsedSecondsAt(points, index - 1);
    const pointSeconds = elapsedSecondsAt(points, index);
    if (!armed) {
      const farEnough = haversineMeters(coordinateOf(point), center) >= minimumRearmDistanceMeters;
      const lateEnough = pointSeconds - lastCrossingSeconds >= minimumRearmSeconds;
      if (farEnough && lateEnough) {
        armed = true;
      }
    }
    if (!armed || pointSeconds <= previousSeconds) {
      continue;
    }
    const left = toLocalMeters(coordinateOf(previous), center);
    const right = toLocalMeters(coordinateOf(point), center);
    const leftForward = dot(left, forward);
    const rightForward = dot(right, forward);
    const direction: GateCrossingDirection | undefined = leftForward <= 0 && rightForward > 0
      ? "forward"
      : leftForward >= 0 && rightForward < 0
        ? "reverse"
        : undefined;
    if (!direction) {
      continue;
    }
    const ratio = -leftForward / (rightForward - leftForward);
    const crossing = {
      x: left.x + (right.x - left.x) * ratio,
      y: left.y + (right.y - left.y) * ratio,
    };
    if (Math.abs(dot(crossing, lateral)) > halfWidth) {
      continue;
    }
    const elapsedSeconds = previousSeconds + (pointSeconds - previousSeconds) * ratio;
    const coordinate = interpolateCoordinate(coordinateOf(previous), coordinateOf(point), ratio);
    events.push({
      id: direction === "forward"
        ? `auto-${gate.id}-${elapsedSeconds.toFixed(3)}`
        : `auto-reverse-${gate.id}-${elapsedSeconds.toFixed(3)}`,
      source: "auto",
      pointIndex: index,
      elapsedSeconds,
      coordinate,
      direction,
    });
    lastCrossingSeconds = elapsedSeconds;
    armed = false;
  }
  return events;
}

export function detectLaps(points: GpsPoint[], gate: TrackGate, options: LapDetectionOptions = {}): LapDetectionResult {
  if (!points.length) {
    return { gate, boundaries: [], laps: [], warnings: ["No GPS points are available for lap detection."] };
  }
  const crossingEvents = detectGateCrossingEvents(points, gate, options);
  const autoBoundaries = crossingEvents
    .filter((event) => event.direction === "forward")
    .map(toTimedBoundary);
  const reverseCrossings = crossingEvents.filter((event) => event.direction === "reverse");
  const boundaries = applyBoundaryOverrides(points, autoBoundaries, options.boundaryOverrides ?? []);
  const laps = buildLaps(points, boundaries);
  const validity = new Map((options.validityOverrides ?? []).map((override) => [override.lapId, override.validity]));
  const adjustedLaps = laps.map((lap) => {
    const hasReverseCrossing = reverseCrossings.some(
      (event) => event.elapsedSeconds >= lap.start.elapsedSeconds && event.elapsedSeconds <= lap.end.elapsedSeconds,
    );
    return {
      ...lap,
      validity: validity.get(lap.id) ?? lap.validity,
      flags: hasReverseCrossing && !lap.flags.includes("reverse-crossing")
        ? [...lap.flags, "reverse-crossing" as const]
        : lap.flags,
    };
  });
  const warnings: string[] = [];
  if (!autoBoundaries.length) {
    warnings.push("The start/finish gate was not crossed in the forward direction.");
  }
  if (adjustedLaps.some((lap) => lap.flags.includes("gps-gap"))) {
    warnings.push("One or more laps contain a GPS time gap.");
  }
  if (reverseCrossings.length) {
    warnings.push("One or more laps crossed the start/finish gate in the reverse direction.");
  }
  return { gate, boundaries, laps: adjustedLaps, warnings };
}

export function elapsedSecondsAt(points: GpsPoint[], index: number): number {
  const point = points[index];
  const first = points[0];
  if (!point || !first) {
    return 0;
  }
  if (point.elapsedRealtimeNanos !== undefined && first.elapsedRealtimeNanos !== undefined) {
    return Math.max(0, (point.elapsedRealtimeNanos - first.elapsedRealtimeNanos) / 1_000_000_000);
  }
  if (point.epochMillis !== undefined && first.epochMillis !== undefined) {
    return Math.max(0, (point.epochMillis - first.epochMillis) / 1000);
  }
  return Math.max(0, index);
}

function applyBoundaryOverrides(
  points: GpsPoint[],
  autoBoundaries: TimedBoundary[],
  overrides: LapBoundaryOverride[],
): TimedBoundary[] {
  const removed = new Set(
    overrides.filter((override) => override.type === "remove").map((override) => override.boundaryId),
  );
  const boundaries = autoBoundaries.filter((boundary) => !removed.has(boundary.id));
  for (const override of overrides) {
    if (override.type !== "add") {
      continue;
    }
    const index = Math.min(points.length - 1, Math.max(0, Math.trunc(override.pointIndex)));
    const point = points[index];
    boundaries.push({
      id: `manual-${override.id}`,
      source: "manual",
      pointIndex: index,
      elapsedSeconds: elapsedSecondsAt(points, index),
      coordinate: coordinateOf(point),
    });
  }
  return boundaries.sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
}

function buildLaps(points: GpsPoint[], boundaries: TimedBoundary[]): LapResult[] {
  const sessionStart: TimedBoundary = {
    id: "session-start",
    source: "session-start",
    pointIndex: 0,
    elapsedSeconds: elapsedSecondsAt(points, 0),
    coordinate: coordinateOf(points[0]),
  };
  const lastIndex = points.length - 1;
  const sessionEnd: TimedBoundary = {
    id: "session-end",
    source: "session-end",
    pointIndex: lastIndex,
    elapsedSeconds: elapsedSecondsAt(points, lastIndex),
    coordinate: coordinateOf(points[lastIndex]),
  };
  if (!boundaries.length) {
    return [createLap(points, sessionStart, sessionEnd, "partial-both", 0)];
  }

  const laps: LapResult[] = [];
  let ordinal = 0;
  const firstBoundary = boundaries[0];
  if (firstBoundary.elapsedSeconds > sessionStart.elapsedSeconds) {
    laps.push(createLap(points, sessionStart, firstBoundary, "partial-start", ordinal));
    ordinal += 1;
  }
  for (let index = 1; index < boundaries.length; index += 1) {
    laps.push(createLap(points, boundaries[index - 1], boundaries[index], "complete", ordinal));
    ordinal += 1;
  }
  const lastBoundary = boundaries[boundaries.length - 1];
  if (lastBoundary.elapsedSeconds < sessionEnd.elapsedSeconds) {
    laps.push(createLap(points, lastBoundary, sessionEnd, "partial-end", ordinal));
  }
  return laps;
}

function createLap(
  points: GpsPoint[],
  start: TimedBoundary,
  end: TimedBoundary,
  completion: LapResult["completion"],
  ordinal: number,
): LapResult {
  const startIndex = Math.min(start.pointIndex, end.pointIndex);
  const endIndex = Math.max(start.pointIndex, end.pointIndex);
  const selected = points.slice(startIndex, endIndex + 1);
  const speeds = selected.map((point) => point.speedKmh).filter(Number.isFinite);
  const flags: LapFlag[] = [];
  if (completion === "partial-start" || completion === "partial-both") {
    flags.push("out-lap");
  }
  if (completion === "partial-end" || completion === "partial-both") {
    flags.push("in-lap");
  }
  if (start.source === "manual" || end.source === "manual") {
    flags.push("manual");
  }
  if (hasGpsGap(points, startIndex, endIndex)) {
    flags.push("gps-gap");
  }
  const durationSeconds = Math.max(0, end.elapsedSeconds - start.elapsedSeconds);
  return {
    id: `lap-${start.id}-${end.id}`,
    ordinal,
    completion,
    validity: flags.includes("gps-gap") ? "invalid" : "valid",
    flags,
    start,
    end,
    startIndex,
    endIndex,
    durationSeconds,
    distanceKm: routeDistanceMeters(selected.map(coordinateOf)) / 1000,
    averageSpeedKmh: speeds.length ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : 0,
    maxSpeedKmh: speeds.length ? Math.max(...speeds) : 0,
  };
}

function hasGpsGap(points: GpsPoint[], startIndex: number, endIndex: number): boolean {
  const deltas: number[] = [];
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const delta = elapsedSecondsAt(points, index) - elapsedSecondsAt(points, index - 1);
    if (delta > 0) {
      deltas.push(delta);
    }
  }
  if (deltas.length < 2) {
    return false;
  }
  const sorted = [...deltas].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(5, median * 3);
  return deltas.some((delta) => delta > threshold);
}

function distinctPoint(points: GpsPoint[], selectedIndex: number, direction: -1 | 1): GpsPoint | undefined {
  const selected = coordinateOf(points[selectedIndex]);
  for (let offset = 1; offset <= 5; offset += 1) {
    const point = points[selectedIndex + direction * offset];
    if (point && haversineMeters(selected, coordinateOf(point)) >= 2) {
      return point;
    }
  }
  return undefined;
}

function dot(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.x * right.x + left.y * right.y;
}

interface InferredGateCandidate {
  gate: TrackGate;
  pointIndex: number;
  completeLapCount: number;
  durationVariation: number;
  distanceVariation: number;
  speedKmh: number;
}

function sampledCandidateIndices(pointCount: number, maximumCandidates: number): number[] {
  if (pointCount <= maximumCandidates) return Array.from({ length: pointCount }, (_, index) => index);
  const indices = new Set<number>([0, pointCount - 1]);
  const step = (pointCount - 1) / (maximumCandidates - 1);
  for (let index = 1; index < maximumCandidates - 1; index += 1) {
    indices.add(Math.round(index * step));
  }
  return [...indices].sort((left, right) => left - right);
}

function relativeMedianDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const median = medianValue(values);
  if (median <= 0) return Number.POSITIVE_INFINITY;
  return medianValue(values.map((value) => Math.abs(value - median))) / median;
}

function medianValue(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function evaluateInferenceCandidate(
  points: GpsPoint[],
  pointIndex: number,
  widthMeters: number,
): InferredGateCandidate | undefined {
  const gate = createGateFromRoutePoint(points, pointIndex, widthMeters);
  if (!gate) return undefined;
  const completeLaps = detectLaps(points, gate).laps.filter((lap) => (
    lap.completion === "complete" &&
    lap.validity === "valid" &&
    lap.durationSeconds !== undefined &&
    lap.durationSeconds > 0 &&
    lap.distanceKm >= 0.1
  ));
  if (!completeLaps.length) return undefined;
  const durationVariation = relativeMedianDeviation(completeLaps.map((lap) => lap.durationSeconds!));
  const distanceVariation = relativeMedianDeviation(completeLaps.map((lap) => lap.distanceKm));
  if (completeLaps.length >= 2 && (durationVariation > 0.25 || distanceVariation > 0.18)) return undefined;
  return {
    gate,
    pointIndex,
    completeLapCount: completeLaps.length,
    durationVariation,
    distanceVariation,
    speedKmh: Number.isFinite(points[pointIndex].speedKmh) ? points[pointIndex].speedKmh : 0,
  };
}

function selectInferredGate(candidates: InferredGateCandidate[]): TrackGate | undefined {
  if (!candidates.length) return undefined;
  const reliableCandidates = candidates.some((candidate) => candidate.completeLapCount >= 2)
    ? candidates.filter((candidate) => candidate.completeLapCount >= 2)
    : candidates;
  const dominantLapCount = modalLapCount(reliableCandidates);
  const selected = reliableCandidates.reduce((best, candidate) => (
    isBetterInference(candidate, best, dominantLapCount) ? candidate : best
  ));
  return selected.gate;
}

function modalLapCount(candidates: InferredGateCandidate[]): number {
  const frequencies = new Map<number, number>();
  const spatialVotes = new Set<string>();
  for (const candidate of candidates) {
    const center = gateCenter(candidate.gate);
    const spatialKey = `${Math.round(center[0] * 20_000)}:${Math.round(center[1] * 20_000)}`;
    const vote = `${spatialKey}:${candidate.completeLapCount}`;
    if (spatialVotes.has(vote)) continue;
    spatialVotes.add(vote);
    frequencies.set(candidate.completeLapCount, (frequencies.get(candidate.completeLapCount) ?? 0) + 1);
  }
  return [...frequencies.entries()]
    .sort(([leftCount, leftFrequency], [rightCount, rightFrequency]) => (
      rightFrequency - leftFrequency || rightCount - leftCount
    ))[0][0];
}

function isBetterInference(
  candidate: InferredGateCandidate,
  current: InferredGateCandidate,
  dominantLapCount: number,
): boolean {
  const candidateCountDeviation = Math.abs(candidate.completeLapCount - dominantLapCount);
  const currentCountDeviation = Math.abs(current.completeLapCount - dominantLapCount);
  if (candidateCountDeviation !== currentCountDeviation) {
    return candidateCountDeviation < currentCountDeviation;
  }
  const candidateVariation = candidate.durationVariation + candidate.distanceVariation;
  const currentVariation = current.durationVariation + current.distanceVariation;
  if (Math.abs(candidateVariation - currentVariation) > 0.001) {
    return candidateVariation < currentVariation;
  }
  if (Math.abs(candidate.speedKmh - current.speedKmh) > 1) {
    return candidate.speedKmh > current.speedKmh;
  }
  return candidate.pointIndex < current.pointIndex;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function toTimedBoundary(event: GateCrossingEvent): TimedBoundary {
  return {
    id: event.id,
    source: event.source,
    pointIndex: event.pointIndex,
    elapsedSeconds: event.elapsedSeconds,
    coordinate: event.coordinate,
  };
}
