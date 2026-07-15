import { bearingDegrees, haversineMeters } from "./geometry";
import type { LapDistanceSample, TrackSection, TrackSectionKind } from "./types";

const MIN_SECTION_METERS = 20;
const MAX_STRAIGHT_METERS = 500;
const CURVATURE_THRESHOLD_DEGREES_PER_METER = 0.08;

interface ClassifiedRange {
  kind: TrackSectionKind;
  startDistanceMeters: number;
  endDistanceMeters: number;
  confidence: number;
}

export function generateAutomaticSections(samples: LapDistanceSample[]): TrackSection[] {
  const ordered = [...samples]
    .filter((sample) => Number.isFinite(sample.distanceMeters))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
  const totalDistanceMeters = ordered.at(-1)?.distanceMeters ?? 0;
  if (ordered.length < 2 || totalDistanceMeters <= 0) return [];

  const curvature = ordered.map((_, index) => curvatureAt(ordered, index));
  const smoothed = curvature.map((_, index) => averageWindow(curvature, index, 2));
  const medianSpeed = median(ordered.map((sample) => sample.speedKmh).filter((speed) => speed > 0)) || 1;
  const classified = ordered.map((sample, index) => {
    const value = smoothed[index];
    const kind: TrackSectionKind = Math.abs(value) < CURVATURE_THRESHOLD_DEGREES_PER_METER
      ? "straight"
      : value < 0
        ? "corner-left"
        : "corner-right";
    const curvatureConfidence = Math.min(1, Math.abs(value) / (CURVATURE_THRESHOLD_DEGREES_PER_METER * 4));
    const speedDrop = Math.min(1, Math.max(0, (medianSpeed - sample.speedKmh) / medianSpeed));
    const confidence = kind === "straight"
      ? Math.min(1, Math.max(0, 1 - curvatureConfidence))
      : Math.min(1, curvatureConfidence * 0.8 + speedDrop * 0.2);
    return { kind, confidence };
  });

  const ranges: ClassifiedRange[] = [];
  let startIndex = 0;
  for (let index = 1; index <= ordered.length; index += 1) {
    const changed = index === ordered.length || classified[index].kind !== classified[startIndex].kind;
    if (!changed) continue;
    ranges.push({
      kind: classified[startIndex].kind,
      startDistanceMeters: startIndex === 0 ? 0 : midpoint(ordered[startIndex - 1].distanceMeters, ordered[startIndex].distanceMeters),
      endDistanceMeters: index === ordered.length
        ? totalDistanceMeters
        : midpoint(ordered[index - 1].distanceMeters, ordered[index].distanceMeters),
      confidence: average(classified.slice(startIndex, index).map((item) => item.confidence)),
    });
    startIndex = index;
  }

  const merged = mergeShortRanges(mergeAdjacentRanges(ranges));
  const split = merged.flatMap(splitLongStraight);
  const normalized = normalizePartition(split, totalDistanceMeters);
  return nameAndIdentify(normalized);
}

export function validateSectionPartition(sections: TrackSection[], totalDistanceMeters: number): boolean {
  if (!sections.length || totalDistanceMeters <= 0) return false;
  const tolerance = 0.001;
  if (Math.abs(sections[0].startDistanceMeters) > tolerance) return false;
  if (Math.abs(sections.at(-1)!.endDistanceMeters - totalDistanceMeters) > tolerance) return false;
  return sections.every((section, index) =>
    section.endDistanceMeters > section.startDistanceMeters &&
    (index === 0 || Math.abs(section.startDistanceMeters - sections[index - 1].endDistanceMeters) <= tolerance));
}

function curvatureAt(samples: LapDistanceSample[], index: number): number {
  if (index === 0 || index === samples.length - 1) return 0;
  const previous = samples[index - 1];
  const current = samples[index];
  const next = samples[index + 1];
  const span = Math.max(
    1,
    haversineMeters([previous.longitude, previous.latitude], [next.longitude, next.latitude]),
  );
  const incoming = bearingDegrees([previous.longitude, previous.latitude], [current.longitude, current.latitude]);
  const outgoing = bearingDegrees([current.longitude, current.latitude], [next.longitude, next.latitude]);
  return signedHeadingDelta(incoming, outgoing) / span;
}

function mergeShortRanges(input: ClassifiedRange[]): ClassifiedRange[] {
  const ranges = input.map((range) => ({ ...range }));
  let index = 0;
  while (ranges.length > 1 && index < ranges.length) {
    const current = ranges[index];
    if (current.endDistanceMeters - current.startDistanceMeters >= MIN_SECTION_METERS) {
      index += 1;
      continue;
    }
    const previous = ranges[index - 1];
    const next = ranges[index + 1];
    if (previous && next && previous.kind === next.kind) {
      previous.endDistanceMeters = next.endDistanceMeters;
      previous.confidence = weightedConfidence(previous, current, next);
      ranges.splice(index, 2);
      index = Math.max(0, index - 1);
      continue;
    }
    const targetPrevious = previous && (!next || rangeLength(previous) >= rangeLength(next));
    if (targetPrevious) {
      previous.endDistanceMeters = current.endDistanceMeters;
      previous.confidence = weightedConfidence(previous, current);
      ranges.splice(index, 1);
      index = Math.max(0, index - 1);
    } else if (next) {
      next.startDistanceMeters = current.startDistanceMeters;
      next.confidence = weightedConfidence(current, next);
      ranges.splice(index, 1);
    } else {
      break;
    }
  }
  return mergeAdjacentRanges(ranges);
}

function mergeAdjacentRanges(input: ClassifiedRange[]): ClassifiedRange[] {
  const result: ClassifiedRange[] = [];
  for (const range of input) {
    const previous = result.at(-1);
    if (previous?.kind === range.kind) {
      const combinedConfidence = weightedConfidence(previous, range);
      previous.endDistanceMeters = range.endDistanceMeters;
      previous.confidence = combinedConfidence;
    } else {
      result.push({ ...range });
    }
  }
  return result;
}

function splitLongStraight(range: ClassifiedRange): ClassifiedRange[] {
  const length = rangeLength(range);
  if (range.kind !== "straight" || length <= MAX_STRAIGHT_METERS) return [range];
  const count = Math.ceil(length / MAX_STRAIGHT_METERS);
  return Array.from({ length: count }, (_, index) => ({
    ...range,
    startDistanceMeters: range.startDistanceMeters + length * index / count,
    endDistanceMeters: range.startDistanceMeters + length * (index + 1) / count,
  }));
}

function normalizePartition(ranges: ClassifiedRange[], totalDistanceMeters: number): ClassifiedRange[] {
  return ranges.map((range, index) => ({
    ...range,
    startDistanceMeters: index === 0 ? 0 : ranges[index - 1].endDistanceMeters,
    endDistanceMeters: index === ranges.length - 1 ? totalDistanceMeters : range.endDistanceMeters,
    confidence: Math.min(1, Math.max(0, range.confidence)),
  }));
}

function nameAndIdentify(ranges: ClassifiedRange[]): TrackSection[] {
  let cornerNumber = 0;
  let straightNumber = 0;
  return ranges.map((range) => {
    const number = range.kind === "straight" ? ++straightNumber : ++cornerNumber;
    const name = range.kind === "straight" ? `Straight ${number}` : `Corner ${number}`;
    return {
      id: `auto-${range.kind}-${Math.round(range.startDistanceMeters)}-${Math.round(range.endDistanceMeters)}`,
      name,
      kind: range.kind,
      startDistanceMeters: range.startDistanceMeters,
      endDistanceMeters: range.endDistanceMeters,
      source: "automatic",
      confidence: Number(range.confidence.toFixed(3)),
    };
  });
}

function weightedConfidence(...ranges: ClassifiedRange[]): number {
  const total = ranges.reduce((sum, range) => sum + rangeLength(range), 0);
  if (total <= 0) return average(ranges.map((range) => range.confidence));
  return ranges.reduce((sum, range) => sum + range.confidence * rangeLength(range), 0) / total;
}

function rangeLength(range: ClassifiedRange): number {
  return range.endDistanceMeters - range.startDistanceMeters;
}

function signedHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function averageWindow(values: number[], index: number, radius: number): number {
  return average(values.slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1)));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function midpoint(left: number, right: number): number {
  return (left + right) / 2;
}
