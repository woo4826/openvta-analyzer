import { useMemo, useState } from "react";
import type { GpsPoint, SegmentSelection, SensorPoint, SummaryStats, VtaFile } from "../domain/types";
import { displayGpsPoints, routeDistanceKm } from "../domain/statistics";
import { downloadText, genericCsv, sensorCsv, summaryJson } from "../domain/export";

interface ExportPanelProps {
  file: VtaFile;
  sensors: SensorPoint[];
  stats: SummaryStats;
  visiblePoints?: GpsPoint[];
}

export function ExportPanel({ file, sensors, stats, visiblePoints }: ExportPanelProps) {
  const points = useMemo(() => visiblePoints ?? displayGpsPoints(file), [file, visiblePoints]);
  const exportStats = useMemo(
    () => (visiblePoints ? summarizeVisiblePoints(file, points) : stats),
    [file, points, stats, visiblePoints],
  );
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.max(0, points.length - 1));
  const boundedStart = clamp(startIndex, 0, Math.max(0, points.length - 1));
  const boundedEnd = clamp(endIndex, 0, Math.max(0, points.length - 1));
  const start = Math.min(boundedStart, boundedEnd);
  const end = Math.max(boundedStart, boundedEnd);
  const count = points.length ? end - start + 1 : 0;

  return (
    <section className="content-band">
      <div className="panel">
        <div className="panel-header">
          <h2>Export</h2>
        </div>
        <div className="panel-body content-band">
          <div className="form-grid">
            <label className="field">
              <span>Segment start point</span>
              <input
                type="number"
                min="0"
                max={Math.max(0, points.length - 1)}
                value={startIndex}
                onChange={(event) => setStartIndex(Number(event.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span>Segment end point</span>
              <input
                type="number"
                min="0"
                max={Math.max(0, points.length - 1)}
                value={endIndex}
                onChange={(event) => setEndIndex(Number(event.target.value) || 0)}
              />
            </label>
            <div className="metric">
              <span>Selected points</span>
              <strong>{count}</strong>
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="button primary"
              onClick={() =>
                downloadText(
                  segmentFilename(file.sourceName),
                  exportVisibleSegmentVta(file, points, { startIndex: start, endIndex: end }),
                  "text/plain",
                )
              }
              disabled={!points.length}
            >
              Export segment .Vta
            </button>
            <button type="button" className="button" onClick={() => downloadText("gps-points.csv", gpsCsv(points), "text/csv")}>
              Export GPS CSV
            </button>
            <button
              type="button"
              className="button"
              onClick={() => downloadText("sensor-points.csv", sensorCsv(sensors), "text/csv")}
            >
              Export Sensor CSV
            </button>
            <button
              type="button"
              className="button"
              onClick={() => downloadText("summary.json", summaryJson(file, exportStats), "application/json")}
            >
              Export Summary JSON
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Segment Preview</h3>
        </div>
        <div className="panel-body metric-grid">
          <Metric label="Source" value={file.sourceName} />
          <Metric label="Format" value={file.detectedFormat} />
          <Metric label="Start" value={points[start] ? `${points[start].date} ${points[start].time}` : "n/a"} />
          <Metric label="End" value={points[end] ? `${points[end].date} ${points[end].time}` : "n/a"} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function exportVisibleSegmentVta(file: VtaFile, points: GpsPoint[], selection: SegmentSelection): string {
  if (!points.length) {
    return [...file.headers, "%% End"].join("\n");
  }
  const start = Math.max(0, Math.min(selection.startIndex, selection.endIndex));
  const end = Math.min(points.length - 1, Math.max(selection.startIndex, selection.endIndex));
  const firstLine = points[start]?.lineNumber ?? 1;
  const lastLine = points[end]?.lineNumber ?? file.rawLines.length;
  const minLine = Math.min(firstLine, lastLine);
  const maxLine = Math.max(firstLine, lastLine);
  const body = file.rawLines
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line, lineNumber }) => line && lineNumber >= minLine && lineNumber <= maxLine)
    .filter(({ line }) => line.startsWith("$") || line.startsWith("@") || line.startsWith("#"))
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

function gpsCsv(points: GpsPoint[]): string {
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
  );
}

function summarizeVisiblePoints(file: VtaFile, points: GpsPoint[]): SummaryStats {
  const speeds = points.map((point) => point.speedKmh);
  const movingSpeeds = speeds.filter((speed) => speed > 0.1);
  const altitudes = points.map((point) => point.altitudeMeters).filter(Number.isFinite);
  const accuracies = points.map((point) => point.accuracyMeters).filter((value): value is number => value !== undefined);
  const startTime = firstDefined(points.map((point) => point.epochMillis));
  const endTime = lastDefined(points.map((point) => point.epochMillis));

  return {
    durationSeconds:
      startTime !== undefined && endTime !== undefined
        ? Math.max(0, (endTime - startTime) / 1000)
        : Math.max(0, points.length - 1),
    distanceKm: routeDistanceKm(points),
    maxSpeedKmh: speeds.length ? Math.max(...speeds) : 0,
    averageMovingSpeedKmh: average(movingSpeeds) ?? 0,
    minAltitudeMeters: altitudes.length ? Math.min(...altitudes) : undefined,
    maxAltitudeMeters: altitudes.length ? Math.max(...altitudes) : undefined,
    averageAccuracyMeters: average(accuracies),
    startTime,
    endTime,
    gpsCount: points.filter((point) => file.gpsPoints.includes(point)).length,
    enhancedCount: points.filter((point) => file.enhancedPoints.includes(point)).length,
    sensorCount: file.sensorPoints.length,
  };
}

function average(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function firstDefined(values: Array<number | undefined>): number | undefined {
  return values.find((value): value is number => value !== undefined);
}

function lastDefined(values: Array<number | undefined>): number | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== undefined) {
      return values[index];
    }
  }
  return undefined;
}

function segmentFilename(sourceName: string): string {
  return sourceName.replace(/\.vta$/i, "") + "_segment.Vta";
}
