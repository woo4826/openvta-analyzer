import type { LineString } from "geojson";
import { analyzeLapSections } from "./sectionAnalysis";
import type {
  GpsPoint,
  LapResult,
  SectionOpportunity,
  TrackSection,
} from "./types";

export function buildSectionOpportunities(
  points: GpsPoint[],
  laps: LapResult[],
  analysisLine: LineString,
  sections: TrackSection[],
  focusedLapId: string | undefined,
  referenceLapId: string | undefined,
  includePartialLapSections: boolean,
): SectionOpportunity[] {
  if (!focusedLapId || !referenceLapId || focusedLapId === referenceLapId) return [];
  const results = analyzeLapSections(
    points,
    laps,
    analysisLine,
    sections,
    includePartialLapSections,
  );

  return sections.flatMap((section) => {
    const sectionResults = results.filter((result) => result.sectionId === section.id);
    const focused = sectionResults.find((result) => result.lapId === focusedLapId);
    const reference = sectionResults.find((result) => result.lapId === referenceLapId);
    if (!focused || !reference) return [];

    const eligibleDurations = sectionResults.flatMap((result) =>
      result.eligibleForBest ? [result.durationSeconds] : []);
    return [{
      section,
      focusedLapId,
      referenceLapId,
      timeDeltaSeconds: focused.durationSeconds - reference.durationSeconds,
      pathDeltaMeters: difference(focused.drivenDistanceMeters, reference.drivenDistanceMeters),
      minimumSpeedDeltaKmh: focused.minimumSpeedKmh - reference.minimumSpeedKmh,
      exitSpeedDeltaKmh: focused.exitSpeedKmh - reference.exitSpeedKmh,
      consistencyStdDevSeconds: standardDeviation(eligibleDurations),
      eligibleSampleCount: eligibleDurations.length,
    } satisfies SectionOpportunity];
  });
}

function difference(value: number | undefined, reference: number | undefined): number | undefined {
  return value === undefined || reference === undefined ? undefined : value - reference;
}

function standardDeviation(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}
