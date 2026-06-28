import { useMemo, useState } from "react";
import type { SensorPoint, SummaryStats, VtaFile } from "../domain/types";
import { displayGpsPoints } from "../domain/statistics";
import { downloadText, exportSegmentVta, gpsCsv, sensorCsv, summaryJson } from "../domain/export";

interface ExportPanelProps {
  file: VtaFile;
  sensors: SensorPoint[];
  stats: SummaryStats;
}

export function ExportPanel({ file, sensors, stats }: ExportPanelProps) {
  const points = useMemo(() => displayGpsPoints(file), [file]);
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
                  exportSegmentVta(file, { startIndex: start, endIndex: end }),
                  "text/plain",
                )
              }
              disabled={!points.length}
            >
              Export segment .Vta
            </button>
            <button type="button" className="button" onClick={() => downloadText("gps-points.csv", gpsCsv(file), "text/csv")}>
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
              onClick={() => downloadText("summary.json", summaryJson(file, stats), "application/json")}
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

function segmentFilename(sourceName: string): string {
  return sourceName.replace(/\.vta$/i, "") + "_segment.Vta";
}

