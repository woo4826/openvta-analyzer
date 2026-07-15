import { useCallback, useEffect, useMemo, useState } from "react";
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
  const scopeLength = analysis.range.endDistanceMeters - analysis.range.startDistanceMeters;
  const keyboardRangeLimit = Math.max(0, Math.floor(scopeLength));
  const [interaction, setInteraction] = useState<"range" | "zoom">("range");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cursorDistanceMeters, setCursorDistanceMeters] = useState(0);
  const [rangeDraft, setRangeDraft] = useState({ start: 0, end: keyboardRangeLimit });
  const visibleMetrics = useMemo(() => showAdvanced
    ? (["speed", "acceleration", "elapsed", "delta", "loss"] as const)
    : (["speed", "delta"] as const), [showAdvanced]);
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
      focusedLap: t("lap.workbench.focusedLap"),
      referenceLap: t("lap.workbench.referenceLap"),
      maximumDelta: t("lap.workbench.maximumDelta"),
    },
    [...visibleMetrics],
  ), [analysis, axis, focusedLapId, overlayLapIds, referenceLapId, t, visibleMetrics]);
  const focused = analysis.records.find((record) => record.lapId === focusedLapId)
    ?? analysis.records.find((record) => record.lapId === referenceLapId);
  const reference = analysis.records.find((record) => record.lapId === referenceLapId);

  useEffect(() => {
    setRangeDraft({ start: 0, end: keyboardRangeLimit });
    setCursorDistanceMeters(Math.max(0, scopeLength / 2));
  }, [analysis.scope, keyboardRangeLimit, scopeLength]);

  const selectRange = useCallback((start: number, end: number) => {
    const distances = axis === "distance"
      ? [start, end]
      : [timeToDistance(focused?.trajectory ?? [], start), timeToDistance(focused?.trajectory ?? [], end)];
    onRange(
      analysis.range.startDistanceMeters + Math.min(...distances),
      analysis.range.startDistanceMeters + Math.max(...distances),
    );
  }, [analysis.range.startDistanceMeters, axis, focused?.trajectory, onRange]);

  const selectPoint = useCallback((sourceIndex: number) => {
    const sample = focused?.trajectory.find((candidate) => candidate.sourceIndex === sourceIndex);
    if (sample) {
      setCursorDistanceMeters(sample.distanceMeters);
      onCursorDistance(sample.distanceMeters);
    }
  }, [focused?.trajectory, onCursorDistance]);
  const focusedSample = nearestDistanceSample(focused?.trajectory ?? [], cursorDistanceMeters);
  const referenceSample = nearestDistanceSample(reference?.trajectory ?? [], cursorDistanceMeters);

  return (
    <ChartPanel
      title={t("lap.workbench.chartTitle")}
      ariaLabel={axis === "distance" ? t("lap.workbench.chartAriaDistance") : t("lap.workbench.chartAriaTime")}
      className={`segment-telemetry-panel ${showAdvanced ? "is-advanced" : "is-compact"}`}
      option={option}
      interactionMode={interaction}
      onPoint={selectPoint}
      onBrushRange={interaction === "range" ? selectRange : undefined}
      actions={(
        <div className="segmented-control" role="group" aria-label={t("lap.workbench.graphDragBehavior")}>
          <button type="button" aria-pressed={interaction === "range"} onClick={() => setInteraction("range")}>{t("lap.workbench.selectRange")}</button>
          <button type="button" aria-pressed={interaction === "zoom"} onClick={() => setInteraction("zoom")}>{t("lap.workbench.zoom")}</button>
          <button type="button" aria-pressed={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>{t("lap.workbench.advancedChannels")}</button>
          <button type="button" onClick={onReset}>{t("lap.workbench.reset")}</button>
        </div>
      )}
      caption={(
        <div className="segment-telemetry-caption">
          <dl className="segment-telemetry-readout" aria-live="polite">
            <div><dt>{t("lap.workbench.cursorDistance")}</dt><dd>{Math.round(cursorDistanceMeters)} m</dd></div>
            <div><dt>{t("lap.workbench.focusedLap")}</dt><dd>{formatSample(focusedSample)}</dd></div>
            <div><dt>{t("lap.workbench.referenceLap")}</dt><dd>{formatSample(referenceSample)}</dd></div>
          </dl>
          <form
            className="segment-keyboard-range"
            onSubmit={(event) => {
              event.preventDefault();
              onRange(
                analysis.range.startDistanceMeters + Math.min(rangeDraft.start, rangeDraft.end),
                analysis.range.startDistanceMeters + Math.max(rangeDraft.start, rangeDraft.end),
              );
            }}
          >
            <span>{t("lap.workbench.keyboardRange")}</span>
            <small>{t("lap.workbench.rangeBasis", {
              scopeStart: Math.round(analysis.range.startDistanceMeters),
              scopeEnd: Math.round(analysis.range.endDistanceMeters),
              length: Math.round(scopeLength),
            })}</small>
            <label><span>{t("lap.workbench.rangeStart")}</span><input type="number" min={0} max={keyboardRangeLimit} step={1} value={rangeDraft.start} onChange={(event) => setRangeDraft((current) => ({ ...current, start: Number(event.target.value) }))} /></label>
            <label><span>{t("lap.workbench.rangeEnd")}</span><input type="number" min={0} max={keyboardRangeLimit} step={1} value={rangeDraft.end} onChange={(event) => setRangeDraft((current) => ({ ...current, end: Number(event.target.value) }))} /></label>
            <button type="submit" className="button">{t("lap.workbench.applyRange")}</button>
          </form>
        </div>
      )}
    />
  );
}

function nearestDistanceSample(samples: SegmentTrajectorySample[], distanceMeters: number): SegmentTrajectorySample | undefined {
  return samples.reduce<SegmentTrajectorySample | undefined>((nearest, sample) =>
    !nearest || Math.abs(sample.distanceMeters - distanceMeters) < Math.abs(nearest.distanceMeters - distanceMeters) ? sample : nearest,
  undefined);
}

function formatSample(sample: SegmentTrajectorySample | undefined): string {
  if (!sample) return "—";
  return `${sample.speedKmh.toFixed(1)} km/h · Δ ${sample.deltaSeconds >= 0 ? "+" : ""}${sample.deltaSeconds.toFixed(3)} s`;
}

function timeToDistance(samples: SegmentTrajectorySample[], elapsedSeconds: number): number {
  if (!samples.length) return 0;
  return samples.reduce((nearest, sample) =>
    Math.abs(sample.elapsedSeconds - elapsedSeconds) < Math.abs(nearest.elapsedSeconds - elapsedSeconds) ? sample : nearest,
  samples[0]).distanceMeters;
}
