import { useMemo } from "react";
import type {
  ActiveSegment,
  CalibrationOffsets,
  FilterSettings,
  GpsPoint,
  SensorPoint,
  SummaryStats,
  TransformMode,
  VtaFile,
} from "../domain/types";
import { buildValidationRows, normalizeSegment } from "../domain/analysis";
import { displayGpsPoints, routeDistanceKm } from "../domain/statistics";
import {
  downloadText,
  exportTransformedVisibleSegmentVta,
  exportVisibleSegmentVta,
  gpsPointsCsv,
  sensorCsv,
  summaryJson,
  validationCsv,
  withLineEndings,
  type LineEnding,
} from "../domain/export";

interface ExportPanelProps {
  file: VtaFile;
  sensors: SensorPoint[];
  stats: SummaryStats;
  visiblePoints?: GpsPoint[];
  activeSegment?: ActiveSegment;
  onActiveSegment: (segment?: ActiveSegment) => void;
  lineEnding: LineEnding;
  onLineEnding: (lineEnding: LineEnding) => void;
  transformMode: TransformMode;
  calibration?: CalibrationOffsets;
  filterSettings: FilterSettings;
}

export function ExportPanel({
  file,
  sensors,
  stats,
  visiblePoints,
  activeSegment,
  onActiveSegment,
  lineEnding,
  onLineEnding,
  transformMode,
  calibration,
  filterSettings,
}: ExportPanelProps) {
  const points = useMemo(() => visiblePoints ?? displayGpsPoints(file), [file, visiblePoints]);
  const normalizedSegment = useMemo(() => {
    if (!points.length) {
      return undefined;
    }
    return activeSegment
      ? normalizeSegment(activeSegment, points.length)
      : { startIndex: 0, endIndex: points.length - 1, source: "manual" as const };
  }, [activeSegment, points.length]);
  const start = normalizedSegment?.startIndex ?? 0;
  const end = normalizedSegment?.endIndex ?? 0;
  const selectedPoints = useMemo(() => (points.length ? points.slice(start, end + 1) : []), [end, points, start]);
  const selectedSensors = useMemo(
    () => (activeSegment || visiblePoints ? sensorsInPointRange(sensors, selectedPoints) : sensors),
    [activeSegment, selectedPoints, sensors, visiblePoints],
  );
  const exportStats = useMemo(
    () => (activeSegment || visiblePoints ? summarizeVisiblePoints(file, selectedPoints, selectedSensors.length) : stats),
    [activeSegment, file, selectedPoints, selectedSensors.length, stats, visiblePoints],
  );
  const count = points.length ? end - start + 1 : 0;
  const validationRows = useMemo(() => buildValidationRows(selectedPoints), [selectedPoints]);

  function updateSegmentBoundary(key: "startIndex" | "endIndex", value: number) {
    if (!points.length) {
      return;
    }
    const nextValue = clamp(Number.isFinite(value) ? Math.trunc(value) : 0, 0, points.length - 1);
    onActiveSegment({
      startIndex: key === "startIndex" ? nextValue : start,
      endIndex: key === "endIndex" ? nextValue : end,
      source: "manual",
    });
  }

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
                value={start}
                onChange={(event) => updateSegmentBoundary("startIndex", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Segment end point</span>
              <input
                type="number"
                min="0"
                max={Math.max(0, points.length - 1)}
                value={end}
                onChange={(event) => updateSegmentBoundary("endIndex", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Line endings</span>
              <select value={lineEnding} onChange={(event) => onLineEnding(event.target.value as LineEnding)}>
                <option value="lf">LF</option>
                <option value="crlf">CRLF</option>
              </select>
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
                  withLineEndings(exportVisibleSegmentVta(file, points, { startIndex: start, endIndex: end }), lineEnding),
                  "text/plain",
                )
              }
              disabled={!points.length}
            >
              Export original segment .Vta
            </button>
            <button
              type="button"
              className="button"
              onClick={() =>
                downloadText(
                  transformedSegmentFilename(file.sourceName),
                  withLineEndings(
                    exportTransformedVisibleSegmentVta(file, points, { startIndex: start, endIndex: end }, sensors, {
                      transformMode,
                      calibration,
                      filterSettings,
                    }),
                    lineEnding,
                  ),
                  "text/plain",
                )
              }
              disabled={!points.length}
            >
              Export transformed segment .Vta
            </button>
            <button
              type="button"
              className="button"
              onClick={() => downloadText("gps-points.csv", gpsPointsCsv(selectedPoints, lineEnding), "text/csv")}
            >
              Export GPS CSV
            </button>
            <button
              type="button"
              className="button"
              onClick={() => downloadText("sensor-points.csv", sensorCsv(selectedSensors, lineEnding), "text/csv")}
            >
              Export Sensor CSV
            </button>
            <button
              type="button"
              className="button"
              onClick={() => downloadText("validation.csv", validationCsv(validationRows, lineEnding), "text/csv")}
            >
              Export validation CSV
            </button>
            <button
              type="button"
              className="button"
              onClick={() =>
                downloadText("summary.json", withLineEndings(summaryJson(file, exportStats), lineEnding), "application/json")
              }
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
          <Metric label="Transform" value={transformMode} />
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

function summarizeVisiblePoints(file: VtaFile, points: GpsPoint[], sensorCount: number): SummaryStats {
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
    sensorCount,
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

function transformedSegmentFilename(sourceName: string): string {
  return sourceName.replace(/\.vta$/i, "") + "_transformed_segment.Vta";
}

function sensorsInPointRange(sensors: SensorPoint[], points: GpsPoint[]): SensorPoint[] {
  if (!points.length) {
    return [];
  }
  const lineNumbers = points.map((point) => point.lineNumber);
  const minLine = Math.min(...lineNumbers);
  const maxLine = Math.max(...lineNumbers);
  return sensors.filter((sensor) => sensor.lineNumber >= minLine && sensor.lineNumber <= maxLine);
}
