import type { GpsPoint, SegmentLapRecord } from "./types";

export function gpsEvidenceConfidence(
  sourcePoints: GpsPoint[],
): SegmentLapRecord["gpsConfidence"] {
  if (!sourcePoints.length) return "unknown";
  const accuracies = sourcePoints.map((point) => point.accuracyMeters).filter(isNumber).sort((a, b) => a - b);
  const medianAccuracy = accuracies.length ? accuracies[Math.floor(accuracies.length / 2)] : undefined;
  const averageConfidence = sourcePoints.reduce((sum, point) => sum + point.confidence, 0) / sourcePoints.length;
  const elapsedSeconds = sourcePoints
    .map((point) => point.elapsedRealtimeNanos !== undefined
      ? point.elapsedRealtimeNanos / 1_000_000_000
      : point.epochMillis !== undefined
        ? point.epochMillis / 1000
        : undefined)
    .filter(isNumber)
    .sort((left, right) => left - right);
  const intervals = elapsedSeconds.slice(1)
    .map((elapsed, index) => elapsed - elapsedSeconds[index])
    .filter((interval) => interval > 0)
    .sort((left, right) => left - right);
  const medianIntervalSeconds = intervals.length ? intervals[Math.floor(intervals.length / 2)] : undefined;
  if (medianIntervalSeconds === undefined) {
    if (medianAccuracy !== undefined && medianAccuracy <= 5 && averageConfidence >= 0.75) return "medium";
    return "unknown";
  }
  if (medianAccuracy !== undefined && medianAccuracy <= 5 && medianIntervalSeconds <= 0.2 && averageConfidence >= 0.75) return "high";
  if ((medianAccuracy === undefined || medianAccuracy <= 12) && medianIntervalSeconds <= 0.5 && averageConfidence >= 0.4) return "medium";
  return "low";
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
