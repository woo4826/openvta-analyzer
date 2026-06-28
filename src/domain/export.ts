import type {
  GpsPoint,
  ParseWarning,
  SegmentSelection,
  SensorPoint,
  SummaryStats,
  ValidationRow,
  VtaFile,
} from "./types";
import { displayGpsPoints } from "./statistics";

export type LineEnding = "lf" | "crlf";
export interface SummaryCsvRow {
  metric: string;
  value: string | number;
  detail?: string | number;
}

export function exportSegmentVta(file: VtaFile, selection: SegmentSelection): string {
  return exportVisibleSegmentVta(file, displayGpsPoints(file), selection);
}

export function exportVisibleSegmentVta(file: VtaFile, points: GpsPoint[], selection: SegmentSelection): string {
  if (!points.length) {
    return [...file.headers, "%% End"].join("\n");
  }
  const start = Math.max(0, Math.min(selection.startIndex, selection.endIndex));
  const end = Math.min(points.length - 1, Math.max(selection.startIndex, selection.endIndex));
  const firstLine = points[start]?.lineNumber ?? 1;
  const lastLine = points[end]?.lineNumber ?? file.rawLines.length;
  const minLine = Math.min(firstLine, lastLine);
  const maxLine = Math.max(firstLine, lastLine);
  const selectedPointLineNumbers = new Set(points.slice(start, end + 1).map((point) => point.lineNumber));
  const sensorLineNumbers = new Set(
    file.sensorPoints
      .filter((sensor) => sensor.lineNumber >= minLine && sensor.lineNumber <= maxLine)
      .map((sensor) => sensor.lineNumber),
  );
  const body = file.rawLines
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line, lineNumber }) => line && lineNumber >= minLine && lineNumber <= maxLine)
    .filter(({ lineNumber }) => selectedPointLineNumbers.has(lineNumber) || sensorLineNumbers.has(lineNumber))
    .map(({ line }) => line);
  return [
    "%% OpenVTA Analyzer Segment Export",
    `%% Source: ${file.sourceName}`,
    `%% SegmentPointIndexes: ${start}-${end}`,
    ...file.headers.filter((line) => !line.startsWith("%% End")),
    ...body,
    "%% End",
  ].join("\n");
}

export function gpsCsv(file: VtaFile): string {
  return gpsPointsCsv(displayGpsPoints(file));
}

export function gpsPointsCsv(points: GpsPoint[], lineEnding: LineEnding = "lf"): string {
  const rows = points.map((point) => [
    point.index,
    point.source,
    point.date,
    point.time,
    point.latitude,
    point.longitude,
    point.altitudeMeters,
    point.speedKmh,
    point.bearingDegrees,
    point.satelliteCount,
    point.accuracyMeters ?? "",
  ]);
  return genericCsv(
    [
      "index",
      "source",
      "date",
      "time",
      "latitude",
      "longitude",
      "altitudeMeters",
      "speedKmh",
      "bearingDegrees",
      "satelliteCount",
      "accuracyMeters",
    ],
    rows,
    lineEnding,
  );
}

export function sensorCsv(sensors: SensorPoint[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    [
      "index",
      "elapsedSeconds",
      "eventCode",
      "accelUnit",
      "accelX",
      "accelY",
      "accelZ",
      "orientationXDegrees",
      "orientationYDegrees",
      "orientationZDegrees",
    ],
    sensors.map((sensor) => [
      sensor.index,
      sensor.elapsedSeconds,
      sensor.eventCode,
      sensor.accelUnit,
      sensor.accelX,
      sensor.accelY,
      sensor.accelZ,
      sensor.orientationXDegrees ?? "",
      sensor.orientationYDegrees ?? "",
      sensor.orientationZDegrees ?? "",
    ]),
    lineEnding,
  );
}

export function summaryJson(file: VtaFile, stats: SummaryStats): string {
  return JSON.stringify(
    {
      sourceName: file.sourceName,
      detectedFormat: file.detectedFormat,
      stats,
      warnings: file.parseWarnings,
    },
    null,
    2,
  );
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function withLineEndings(text: string, lineEnding: LineEnding): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lineEnding === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

export function genericCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
  lineEnding: LineEnding = "lf",
): string {
  return withLineEndings([headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n"), lineEnding);
}

export function validationCsv(rows: ValidationRow[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    ["index", "elapsedSeconds", "speedKmh", "deltaSpeedKmh", "derivedAccelMps2"],
    rows.map((row) => [
      row.index,
      row.elapsedSeconds,
      row.speedKmh,
      row.deltaSpeedKmh,
      row.derivedAccelMps2,
    ]),
    lineEnding,
  );
}

export function warningsCsv(warnings: ParseWarning[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    ["lineNumber", "code", "message"],
    warnings.map((warning) => [warning.lineNumber ?? "", warning.code, warning.message]),
    lineEnding,
  );
}

export function summaryRowsCsv(rows: SummaryCsvRow[], lineEnding: LineEnding = "lf"): string {
  return genericCsv(
    ["metric", "value", "detail"],
    rows.map((row) => [row.metric, row.value, row.detail ?? ""]),
    lineEnding,
  );
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
