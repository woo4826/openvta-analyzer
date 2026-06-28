import type {
  CalibrationOffsets,
  FilterSettings,
  GpsPoint,
  ParseWarning,
  SegmentSelection,
  SensorPoint,
  SummaryStats,
  TransformMode,
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

export interface TransformedSegmentExportMetadata {
  transformMode: TransformMode;
  calibration?: CalibrationOffsets;
  filterSettings?: FilterSettings;
}

export function exportSegmentVta(file: VtaFile, selection: SegmentSelection): string {
  return exportVisibleSegmentVta(file, displayGpsPoints(file), selection);
}

export function exportVisibleSegmentVta(file: VtaFile, points: GpsPoint[], selection: SegmentSelection): string {
  if (!points.length) {
    return [...file.headers, "%% End"].join("\n");
  }
  const segment = buildVisibleSegmentContext(file, points, selection);
  if (!segment) {
    return [...file.headers, "%% End"].join("\n");
  }
  return [
    "%% OpenVTA Analyzer Segment Export",
    `%% Source: ${file.sourceName}`,
    `%% SegmentPointIndexes: ${segment.start}-${segment.end}`,
    ...file.headers.filter((line) => !line.startsWith("%% End")),
    ...segment.bodyRows.map(({ line }) => line),
    "%% End",
  ].join("\n");
}

export function exportTransformedSegmentVta(
  file: VtaFile,
  selection: SegmentSelection,
  transformedSensors: SensorPoint[],
  metadata: TransformedSegmentExportMetadata,
): string {
  return exportTransformedVisibleSegmentVta(file, displayGpsPoints(file), selection, transformedSensors, metadata);
}

export function exportTransformedVisibleSegmentVta(
  file: VtaFile,
  points: GpsPoint[],
  selection: SegmentSelection,
  transformedSensors: SensorPoint[],
  metadata: TransformedSegmentExportMetadata,
): string {
  const segment = buildVisibleSegmentContext(file, points, selection);
  const transformedByLineNumber = new Map(
    transformedSensors
      .filter((sensor) => !segment || (sensor.lineNumber >= segment.minLine && sensor.lineNumber <= segment.maxLine))
      .map((sensor) => [sensor.lineNumber, sensor]),
  );
  const body = segment
    ? segment.bodyRows.map(({ line, lineNumber }) => {
        const transformedSensor = transformedByLineNumber.get(lineNumber);
        return line.startsWith("#") && transformedSensor ? serializeSensorLine(file, transformedSensor) : line;
      })
    : [];

  return [
    "%% OpenVTA Analyzer Transformed Segment Export",
    `%% Source: ${file.sourceName}`,
    `%% SegmentPointIndexes: ${segment ? `${segment.start}-${segment.end}` : "none"}`,
    ...transformMetadataLines(metadata),
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

interface VisibleSegmentContext {
  start: number;
  end: number;
  minLine: number;
  maxLine: number;
  bodyRows: Array<{ line: string; lineNumber: number }>;
}

function buildVisibleSegmentContext(
  file: VtaFile,
  points: GpsPoint[],
  selection: SegmentSelection,
): VisibleSegmentContext | undefined {
  if (!points.length) {
    return undefined;
  }

  const firstIndex = clampIndex(Math.min(selection.startIndex, selection.endIndex), points.length);
  const lastIndex = clampIndex(Math.max(selection.startIndex, selection.endIndex), points.length);
  const start = Math.min(firstIndex, lastIndex);
  const end = Math.max(firstIndex, lastIndex);
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
  const bodyRows = file.rawLines
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line, lineNumber }) => line && lineNumber >= minLine && lineNumber <= maxLine)
    .filter(({ lineNumber }) => selectedPointLineNumbers.has(lineNumber) || sensorLineNumbers.has(lineNumber));

  return { start, end, minLine, maxLine, bodyRows };
}

function transformMetadataLines(metadata: TransformedSegmentExportMetadata): string[] {
  const lines = [`%% TransformMode: ${metadata.transformMode}`];
  if (metadata.calibration) {
    lines.push(
      [
        "%% Calibration:",
        `unit=${metadata.calibration.unit};`,
        `samples=${metadata.calibration.sampleCount};`,
        `x=${formatNumber(metadata.calibration.x)};`,
        `y=${formatNumber(metadata.calibration.y)};`,
        `z=${formatNumber(metadata.calibration.z)};`,
        `source=${metadata.calibration.sourceName ?? "manual"}`,
      ].join(" "),
    );
  } else {
    lines.push("%% Calibration: none");
  }

  if (metadata.filterSettings) {
    const channels = Object.entries(metadata.filterSettings.channels)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel.toUpperCase())
      .join("");
    lines.push(
      `%% Filter: enabled=${metadata.filterSettings.enabled}; cutoffHz=${formatNumber(
        metadata.filterSettings.cutoffHz,
      )}; channels=${channels || "none"}`,
    );
  } else {
    lines.push("%% Filter: none");
  }
  return lines;
}

function serializeSensorLine(file: VtaFile, sensor: SensorPoint): string {
  if (file.detectedFormat === "legacy-imu-box") {
    return `#${[
      formatNumber(sensor.elapsedSeconds),
      String(sensor.eventCode),
      optionalNumber(sensor.orientationXDegrees),
      optionalNumber(sensor.orientationYDegrees),
      optionalNumber(sensor.orientationZDegrees),
      formatNumber(sensor.accelX),
      formatNumber(sensor.accelY),
      formatNumber(sensor.accelZ),
    ].join(",")}`;
  }

  const parts = [
    String(sensor.index),
    formatNumber(sensor.elapsedSeconds),
    String(sensor.eventCode),
    optionalNumber(sensor.orientationXDegrees),
    optionalNumber(sensor.orientationYDegrees),
    optionalNumber(sensor.orientationZDegrees),
    formatNumber(sensor.accelX),
    formatNumber(sensor.accelY),
    formatNumber(sensor.accelZ),
    optionalNumber(sensor.timestampNanos),
    optionalNumber(sensor.accuracy),
    optionalNumber(sensor.gyroX),
    optionalNumber(sensor.gyroY),
    optionalNumber(sensor.gyroZ),
    optionalNumber(sensor.rotationAzimuth),
    optionalNumber(sensor.rotationPitch),
    optionalNumber(sensor.rotationRoll),
  ];
  while (parts[parts.length - 1] === "") {
    parts.pop();
  }
  return `#${parts.join(",")}`;
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? "" : formatNumber(value);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(6)));
}

function clampIndex(value: number, pointCount: number): number {
  const index = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(pointCount - 1, Math.max(0, index));
}
