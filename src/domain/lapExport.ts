import { genericCsv, type LineEnding } from "./export";
import type {
  CornerAnalysisResult,
  LapAnalysisSettings,
  LapResult,
  LapSectionResult,
  TimingSectorResult,
  TrackProfileV1,
} from "./types";

export function lapResultsCsv(laps: LapResult[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    ["lapId", "ordinal", "completion", "validity", "durationSeconds", "distanceKm", "averageSpeedKmh", "maxSpeedKmh", "flags", "startIndex", "endIndex"],
    laps.map((lap) => [
      lap.id,
      lap.ordinal,
      lap.completion,
      lap.validity,
      lap.durationSeconds ?? "",
      lap.distanceKm,
      lap.averageSpeedKmh,
      lap.maxSpeedKmh,
      lap.flags.join("|"),
      lap.startIndex,
      lap.endIndex,
    ]),
    lineEnding,
  );
}

export function sectorResultsCsv(sectors: TimingSectorResult[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    ["lapId", "sectorIndex", "name", "durationSeconds", "fromPartialLap", "eligibleForBest", "startGateId", "endGateId"],
    sectors.map((sector) => [
      sector.lapId,
      sector.sectorIndex + 1,
      sector.name,
      sector.durationSeconds,
      sector.fromPartialLap ? "true" : "false",
      sector.eligibleForBest ? "true" : "false",
      sector.startGateId,
      sector.endGateId,
    ]),
    lineEnding,
  );
}

export function cornerResultsCsv(corners: CornerAnalysisResult[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    ["lapId", "sectionId", "name", "kind", "durationSeconds", "entrySpeedKmh", "minimumSpeedKmh", "exitSpeedKmh", "maxLateralG", "maxDecelerationG"],
    corners.map((corner) => [
      corner.lapId,
      corner.sectionId,
      corner.name,
      corner.kind,
      corner.durationSeconds,
      corner.entrySpeedKmh,
      corner.minimumSpeedKmh,
      corner.exitSpeedKmh,
      corner.maxLateralG ?? "",
      corner.maxDecelerationG ?? "",
    ]),
    lineEnding,
  );
}

export function sectionResultsCsv(results: LapSectionResult[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    [
      "lapId",
      "sectionId",
      "name",
      "kind",
      "durationSeconds",
      "deltaBestSeconds",
      "entrySpeedKmh",
      "minimumSpeedKmh",
      "averageSpeedKmh",
      "maximumSpeedKmh",
      "exitSpeedKmh",
      "maxLateralG",
      "maxDecelerationG",
      "fromPartialLap",
      "eligibleForBest",
    ],
    results.map((result) => [
      result.lapId,
      result.sectionId,
      result.name,
      result.kind,
      result.durationSeconds,
      result.deltaBestSeconds ?? "",
      result.entrySpeedKmh,
      result.minimumSpeedKmh,
      result.averageSpeedKmh,
      result.maximumSpeedKmh,
      result.exitSpeedKmh,
      result.maxLateralG ?? "",
      result.maxDecelerationG ?? "",
      result.fromPartialLap ? "true" : "false",
      result.eligibleForBest ? "true" : "false",
    ]),
    lineEnding,
  );
}

export function lapAnalysisJson(input: {
  sourceName: string;
  profile?: TrackProfileV1;
  settings: LapAnalysisSettings;
  laps: LapResult[];
  sectors: TimingSectorResult[];
  corners: CornerAnalysisResult[];
  theoreticalBestSeconds?: number;
  sectionResults?: LapSectionResult[];
  automaticTheoreticalBestSeconds?: number;
}): string {
  return `${JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), ...input }, null, 2)}\n`;
}
