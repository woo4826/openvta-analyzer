import { useCallback, useId, useMemo } from "react";
import type { SegmentAxis } from "../app/useSegmentWorkbench";
import type {
  SegmentAnalysisResult,
  SegmentTrajectorySample,
  SynchronizedAccelerationSeries,
} from "../domain/types";
import { ChartPanel, type CursorKeyAction } from "./ChartPanel";
import { SegmentTelemetryTrackInset } from "./SegmentTelemetryTrackInset";
import { buildSegmentTelemetryOption } from "./segmentTelemetryOptions";
import { useI18n } from "../i18n/useI18n";

interface SegmentTelemetryChartProps {
  analysis: SegmentAnalysisResult;
  visibleLapIds: string[];
  focusedLapId?: string;
  referenceLapId?: string;
  axis: SegmentAxis;
  synchronizedAcceleration?: SynchronizedAccelerationSeries;
  cursorDistanceMeters?: number;
  onCursor: (distanceMeters: number, sourceIndex: number) => void;
}

export function SegmentTelemetryChart({
  analysis,
  visibleLapIds,
  focusedLapId,
  referenceLapId,
  axis,
  synchronizedAcceleration,
  cursorDistanceMeters: controlledCursorDistanceMeters,
  onCursor,
}: SegmentTelemetryChartProps) {
  const { t } = useI18n();
  const interpretationId = useId();
  const scopeLength = analysis.range.endDistanceMeters - analysis.range.startDistanceMeters;
  const cursorDistanceMeters = controlledCursorDistanceMeters ?? Math.max(0, scopeLength / 2);
  const option = useMemo(() => buildSegmentTelemetryOption(
    analysis,
    visibleLapIds,
    axis,
    focusedLapId,
    referenceLapId,
    {
      speed: t("lap.workbench.chartSpeed"),
      imuAcceleration: t("lap.workbench.chartImuAcceleration"),
      imuAxisX: t("lap.workbench.chartImuAxisX"),
      imuAxisY: t("lap.workbench.chartImuAxisY"),
      imuAxisZ: t("lap.workbench.chartImuAxisZ"),
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
    ["speed", "imu-acceleration", "delta"],
    synchronizedAcceleration,
  ), [analysis, axis, focusedLapId, referenceLapId, synchronizedAcceleration, t, visibleLapIds]);
  const focused = analysis.records.find((record) => record.lapId === focusedLapId)
    ?? analysis.records.find((record) => record.lapId === referenceLapId);
  const reference = analysis.records.find((record) => record.lapId === referenceLapId);
  const cursorX = axis === "distance"
    ? cursorDistanceMeters
    : nearestDistanceSample(focused?.trajectory ?? [], cursorDistanceMeters)?.elapsedSeconds;

  const selectPoint = useCallback((sourceIndex: number, domainValue?: number) => {
    const trajectory = focused?.trajectory ?? [];
    const exactDistance = domainValue === undefined
      ? undefined
      : axis === "distance" ? domainValue : timeToDistance(trajectory, domainValue);
    const sample = exactDistance === undefined
      ? nearestSourceSample(trajectory, sourceIndex)
      : nearestDistanceSample(trajectory, exactDistance);
    if (sample) {
      onCursor(exactDistance ?? sample.distanceMeters, sample.sourceIndex);
    }
  }, [axis, focused?.trajectory, onCursor]);
  const selectDomain = useCallback((domainValue: number) => {
    selectPoint(0, domainValue);
  }, [selectPoint]);
  const focusedSample = nearestDistanceSample(focused?.trajectory ?? [], cursorDistanceMeters);
  const referenceSample = nearestDistanceSample(reference?.trajectory ?? [], cursorDistanceMeters);
  const selectCursorKey = useCallback((action: CursorKeyAction) => {
    const trajectory = focused?.trajectory ?? [];
    if (!trajectory.length) return;
    const current = nearestDistanceSample(trajectory, cursorDistanceMeters) ?? trajectory[0];
    const currentIndex = Math.max(0, trajectory.indexOf(current));
    const pageStep = Math.max(1, Math.floor(trajectory.length / 20));
    const nextIndex = action === "start"
      ? 0
      : action === "end"
        ? trajectory.length - 1
        : Math.max(0, Math.min(trajectory.length - 1, currentIndex + (
            action === "previous" ? -1
              : action === "next" ? 1
                : action === "page-previous" ? -pageStep
                  : pageStep
          )));
    const next = trajectory[nextIndex];
    onCursor(next.distanceMeters, next.sourceIndex);
  }, [cursorDistanceMeters, focused?.trajectory, onCursor]);

  return (
    <ChartPanel
      title={t("lap.workbench.chartTitle")}
      ariaLabel={axis === "distance" ? t("lap.workbench.chartAriaDistance") : t("lap.workbench.chartAriaTime")}
      className="segment-telemetry-panel"
      option={option}
      cursorX={cursorX}
      describedBy={interpretationId}
      onCursorKey={selectCursorKey}
      onPoint={selectPoint}
      onHoverDomain={selectDomain}
      caption={(
        <div className="segment-telemetry-context" id={interpretationId}>
          <SegmentTelemetryTrackInset focused={focused} reference={reference} cursorDistanceMeters={cursorDistanceMeters} />
          <div className="segment-telemetry-explanation">
            <p><strong>{t("lap.workbench.chartDelta")}</strong> · {t("lap.workbench.deltaInterpretation")}</p>
            <p><strong>{t("lap.workbench.chartImuAcceleration")}</strong> · {t("lap.workbench.deviceAxesInterpretation")}</p>
            <p className="segment-keyboard-help">{t("lap.workbench.keyboardCursorHelp")}</p>
            <dl className="segment-telemetry-readout" aria-live="polite">
              <div><dt>{t("lap.workbench.cursorDistance")}</dt><dd>{Math.round(cursorDistanceMeters)} m</dd></div>
              <div><dt>{t("lap.workbench.focusedLap")}</dt><dd>{formatSample(focusedSample)}</dd></div>
              <div><dt>{t("lap.workbench.referenceLap")}</dt><dd>{formatSample(referenceSample)}</dd></div>
              <div><dt>{t("lap.workbench.imuSync")}</dt><dd>{synchronizationLabel(synchronizedAcceleration, t)}</dd></div>
            </dl>
          </div>
        </div>
      )}
    />
  );
}

function nearestSourceSample(samples: SegmentTrajectorySample[], sourceIndex: number): SegmentTrajectorySample | undefined {
  return samples.reduce<SegmentTrajectorySample | undefined>((nearest, sample) =>
    !nearest || Math.abs(sample.sourceIndex - sourceIndex) < Math.abs(nearest.sourceIndex - sourceIndex)
      ? sample
      : nearest,
  undefined);
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

function synchronizationLabel(
  series: SynchronizedAccelerationSeries | undefined,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!series?.samples.length) return t("lap.workbench.imuUnavailable");
  const labelKey = {
    timestamp: "lap.workbench.imuSyncTimestamp",
    "sensor-clock": "lap.workbench.imuSyncSensorClock",
    "line-order": "lap.workbench.imuSyncLineOrder",
  } as const satisfies Record<SynchronizedAccelerationSeries["method"], Parameters<typeof t>[0]>;
  return t(labelKey[series.method], { samples: series.samples.length });
}
