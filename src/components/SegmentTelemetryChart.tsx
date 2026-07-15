import { useMemo, useState } from "react";
import type { SegmentAxis } from "../app/useSegmentWorkbench";
import type { SegmentAnalysisResult, SegmentTrajectorySample } from "../domain/types";
import { ChartPanel } from "./ChartPanel";
import { buildSegmentTelemetryOption } from "./segmentTelemetryOptions";
import { useI18n } from "../i18n/useI18n";

interface SegmentTelemetryChartProps {
  analysis: SegmentAnalysisResult;
  overlayLapIds: string[];
  focusedLapId?: string;
  referenceLapId?: string;
  axis: SegmentAxis;
  onRange: (startDistanceMeters: number, endDistanceMeters: number) => void;
  onReset: () => void;
  onCursorDistance: (distanceMeters: number) => void;
}

export function SegmentTelemetryChart({
  analysis,
  overlayLapIds,
  focusedLapId,
  referenceLapId,
  axis,
  onRange,
  onReset,
  onCursorDistance,
}: SegmentTelemetryChartProps) {
  const { t } = useI18n();
  const [interaction, setInteraction] = useState<"range" | "zoom">("range");
  const option = useMemo(() => buildSegmentTelemetryOption(
    analysis,
    overlayLapIds,
    axis,
    focusedLapId,
    referenceLapId,
    {
      speed: t("lap.workbench.chartSpeed"),
      acceleration: t("lap.workbench.chartAcceleration"),
      elapsed: t("lap.workbench.chartElapsed"),
      delta: t("lap.workbench.chartDelta"),
      loss: t("lap.workbench.chartLoss"),
      distanceAxis: t("lap.workbench.chartDistanceAxis"),
      timeAxis: t("lap.workbench.chartTimeAxis"),
      lap: t("lap.lap"),
    },
  ), [analysis, axis, focusedLapId, overlayLapIds, referenceLapId, t]);
  const focused = analysis.records.find((record) => record.lapId === focusedLapId)
    ?? analysis.records.find((record) => record.lapId === referenceLapId);

  const selectRange = (start: number, end: number) => {
    const distances = axis === "distance"
      ? [start, end]
      : [timeToDistance(focused?.trajectory ?? [], start), timeToDistance(focused?.trajectory ?? [], end)];
    onRange(
      analysis.range.startDistanceMeters + Math.min(...distances),
      analysis.range.startDistanceMeters + Math.max(...distances),
    );
  };

  const selectPoint = (sourceIndex: number) => {
    const sample = focused?.trajectory.find((candidate) => candidate.sourceIndex === sourceIndex);
    if (sample) onCursorDistance(sample.distanceMeters);
  };

  return (
    <ChartPanel
      title={t("lap.workbench.chartTitle")}
      ariaLabel={axis === "distance" ? t("lap.workbench.chartAriaDistance") : t("lap.workbench.chartAriaTime")}
      className="segment-telemetry-panel"
      option={option}
      onPoint={selectPoint}
      onBrushRange={interaction === "range" ? selectRange : undefined}
      actions={(
        <div className="segmented-control" role="group" aria-label={t("lap.workbench.graphDragBehavior")}>
          <button type="button" aria-pressed={interaction === "range"} onClick={() => setInteraction("range")}>{t("lap.workbench.selectRange")}</button>
          <button type="button" aria-pressed={interaction === "zoom"} onClick={() => setInteraction("zoom")}>{t("lap.workbench.zoom")}</button>
          <button type="button" onClick={onReset}>{t("lap.workbench.reset")}</button>
        </div>
      )}
    />
  );
}

function timeToDistance(samples: SegmentTrajectorySample[], elapsedSeconds: number): number {
  if (!samples.length) return 0;
  return samples.reduce((nearest, sample) =>
    Math.abs(sample.elapsedSeconds - elapsedSeconds) < Math.abs(nearest.elapsedSeconds - elapsedSeconds) ? sample : nearest,
  samples[0]).distanceMeters;
}
