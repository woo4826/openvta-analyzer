import { useMemo, useState } from "react";
import type { LineString } from "geojson";
import { scopedLapComparison } from "../domain/sectionAnalysis";
import type { ActiveSegment, GpsPoint, LapResult, TrackSection } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { ChartPanel } from "./ChartPanel";
import { buildLapTelemetryOption, type TelemetryAxis } from "./lapTelemetryOptions";
import { Panel } from "./ui";

interface LapTelemetryChartProps {
  points: GpsPoint[];
  primaryLap?: LapResult;
  referenceLap?: LapResult;
  analysisLine?: LineString;
  section?: TrackSection;
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  onActiveSegment: (segment?: ActiveSegment) => void;
}

export function LapTelemetryChart({
  points,
  primaryLap,
  referenceLap,
  analysisLine,
  section,
  selectedPointIndex,
  onSelectedPointIndex,
  onActiveSegment,
}: LapTelemetryChartProps) {
  const { t } = useI18n();
  const [axis, setAxis] = useState<TelemetryAxis>("time");
  const samples = useMemo(
    () => primaryLap && analysisLine
      ? scopedLapComparison(points, primaryLap, referenceLap, analysisLine, section, 5)
      : [],
    [analysisLine, points, primaryLap, referenceLap, section],
  );
  const option = useMemo(
    () => buildLapTelemetryOption(samples, axis, Boolean(referenceLap), selectedPointIndex, t),
    [axis, referenceLap, samples, selectedPointIndex, t],
  );

  if (!samples.length) {
    return (
      <Panel title={t("lap.telemetry.title")} className="lap-telemetry-chart lap-wide-panel">
        <div className="empty-state">{t("lap.telemetry.noData")}</div>
      </Panel>
    );
  }

  return (
    <ChartPanel
      title={t("lap.telemetry.title")}
      eyebrow={t("lap.telemetry.eyebrow")}
      ariaLabel={t("lap.telemetry.chartAria")}
      className="lap-telemetry-chart lap-wide-panel"
      option={option}
      actions={(
        <div className="segmented" role="group" aria-label={t("lap.telemetry.axisAria")}>
          {(["time", "distance"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={axis === value ? "active" : undefined}
              aria-pressed={axis === value}
              onClick={() => setAxis(value)}
            >
              {value === "time" ? t("lap.telemetry.time") : t("lap.telemetry.distance")}
            </button>
          ))}
        </div>
      )}
      onPoint={onSelectedPointIndex}
      onBrushSegment={(startIndex, endIndex) => onActiveSegment({
        startIndex: Math.min(startIndex, endIndex),
        endIndex: Math.max(startIndex, endIndex),
        source: "chart",
      })}
    />
  );
}
