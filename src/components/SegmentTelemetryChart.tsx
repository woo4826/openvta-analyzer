import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { SegmentAxis } from "../app/useSegmentWorkbench";
import type {
  SegmentAnalysisResult,
  SegmentTelemetryLayout,
  SegmentTrajectorySample,
  SynchronizedAccelerationSeries,
} from "../domain/types";
import { ChartPanel, type CursorKeyAction } from "./ChartPanel";
import { SegmentTelemetryTrackInset } from "./SegmentTelemetryTrackInset";
import {
  buildSegmentTelemetryMetricOption,
  type CoreSegmentTelemetryMetric,
  type SegmentTelemetryLabels,
  type SegmentTelemetryZoomWindow,
} from "./segmentTelemetryOptions";
import { useI18n } from "../i18n/useI18n";

interface SegmentTelemetryChartProps {
  analysis: SegmentAnalysisResult;
  visibleLapIds: string[];
  focusedLapId?: string;
  referenceLapId?: string;
  axis: SegmentAxis;
  synchronizedAcceleration?: SynchronizedAccelerationSeries;
  cursorDistanceMeters?: number;
  layout?: SegmentTelemetryLayout;
  onLayout?: (layout: SegmentTelemetryLayout) => void;
  onCursor: (distanceMeters: number, sourceIndex: number) => void;
}

const TELEMETRY_LAYOUTS: SegmentTelemetryLayout[] = ["three-column", "two-plus-one", "three-stacked"];
const CORE_METRICS: CoreSegmentTelemetryMetric[] = ["speed", "delta", "imu-acceleration"];

export function SegmentTelemetryChart({
  analysis,
  visibleLapIds,
  focusedLapId,
  referenceLapId,
  axis,
  synchronizedAcceleration,
  cursorDistanceMeters: controlledCursorDistanceMeters,
  layout = "three-column",
  onLayout = () => undefined,
  onCursor,
}: SegmentTelemetryChartProps) {
  const { t } = useI18n();
  const interpretationId = useId();
  const [zoomWindow, setZoomWindow] = useState<SegmentTelemetryZoomWindow>({ start: 0, end: 100 });
  const scopeLength = analysis.range.endDistanceMeters - analysis.range.startDistanceMeters;
  const cursorDistanceMeters = controlledCursorDistanceMeters ?? Math.max(0, scopeLength / 2);
  const labels = useMemo<SegmentTelemetryLabels>(() => ({
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
  }), [t]);
  const focused = analysis.records.find((record) => record.lapId === focusedLapId)
    ?? analysis.records.find((record) => record.lapId === referenceLapId);
  const reference = analysis.records.find((record) => record.lapId === referenceLapId);
  const cursorX = axis === "distance"
    ? cursorDistanceMeters
    : nearestDistanceSample(focused?.trajectory ?? [], cursorDistanceMeters)?.elapsedSeconds;
  const options = useMemo(() => Object.fromEntries(CORE_METRICS.map((metric) => [metric, buildSegmentTelemetryMetricOption(
    analysis,
    visibleLapIds,
    axis,
    focusedLapId,
    referenceLapId,
    labels,
    metric,
    synchronizedAcceleration,
    zoomWindow,
    metric === "imu-acceleration",
  )])) as Record<CoreSegmentTelemetryMetric, ReturnType<typeof buildSegmentTelemetryMetricOption>>, [
    analysis,
    axis,
    focusedLapId,
    labels,
    referenceLapId,
    synchronizedAcceleration,
    visibleLapIds,
    zoomWindow,
  ]);

  useEffect(() => {
    setZoomWindow((current) => current.start === 0 && current.end === 100 ? current : { start: 0, end: 100 });
  }, [analysis.range.endDistanceMeters, analysis.range.startDistanceMeters, axis, focusedLapId]);

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
  const accelerationSample = nearestAccelerationSample(synchronizedAcceleration, cursorDistanceMeters);
  const updateZoomWindow = useCallback((next: SegmentTelemetryZoomWindow) => {
    setZoomWindow((current) => current.start === next.start && current.end === next.end ? current : next);
  }, []);
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

  const layoutLabel = (candidate: SegmentTelemetryLayout) => t({
    "three-column": "lap.workbench.layoutThreeColumn",
    "two-plus-one": "lap.workbench.layoutTwoPlusOne",
    "three-stacked": "lap.workbench.layoutThreeStacked",
  }[candidate] as Parameters<typeof t>[0]);
  const metricAriaLabel = (metric: CoreSegmentTelemetryMetric) => t({
    distance: {
      speed: "lap.workbench.chartSpeedAriaDistance",
      delta: "lap.workbench.chartDeltaAriaDistance",
      "imu-acceleration": "lap.workbench.chartAccelerationAriaDistance",
    },
    time: {
      speed: "lap.workbench.chartSpeedAriaTime",
      delta: "lap.workbench.chartDeltaAriaTime",
      "imu-acceleration": "lap.workbench.chartAccelerationAriaTime",
    },
  }[axis][metric] as Parameters<typeof t>[0]);
  const metricTitle = (metric: CoreSegmentTelemetryMetric) => ({
    speed: t("lap.workbench.chartSpeed"),
    delta: t("lap.workbench.chartDelta"),
    "imu-acceleration": t("lap.workbench.chartImuAcceleration"),
  }[metric]);
  const metricUnavailable = (metric: CoreSegmentTelemetryMetric): string | undefined => {
    if (!focused?.trajectory.length) return t("lap.workbench.telemetryUnavailable");
    if (metric === "delta" && !reference?.trajectory.length) return t("lap.workbench.referenceRequired");
    if (metric === "imu-acceleration" && !synchronizedAcceleration?.samples.length) {
      return t("lap.workbench.measuredAccelerationUnavailable");
    }
    return undefined;
  };

  return (
    <section className="segment-telemetry-panel" aria-label={t("lap.workbench.chartTitle")}>
      <header className="segment-telemetry-toolbar">
        <div>
          <span className="panel-eyebrow">{axis === "distance" ? t("lap.workbench.distanceAxis") : t("lap.workbench.timeAxis")}</span>
          <h3>{t("lap.workbench.chartTitle")}</h3>
        </div>
        <div className="segment-telemetry-layout-control" role="group" aria-label={t("lap.workbench.telemetryLayout")}>
          {TELEMETRY_LAYOUTS.map((candidate) => <button
            type="button"
            key={candidate}
            aria-pressed={layout === candidate}
            onClick={() => onLayout(candidate)}
          >
            <span className={`segment-layout-glyph is-${candidate}`} aria-hidden="true"><i /><i /><i /></span>
            <span>{layoutLabel(candidate)}</span>
          </button>)}
        </div>
      </header>

      <div className={`segment-telemetry-grid is-${layout}`} data-layout={layout}>
        {CORE_METRICS.map((metric) => {
          const unavailable = metricUnavailable(metric);
          return <div className={`segment-telemetry-metric-card is-${metric}`} key={metric}>
            <ChartPanel
              title={metricTitle(metric)}
              ariaLabel={metricAriaLabel(metric)}
              className="segment-telemetry-metric"
              option={options[metric]}
              cursorX={cursorX}
              describedBy={interpretationId}
              onCursorKey={selectCursorKey}
              onPoint={selectPoint}
              onHoverDomain={selectDomain}
              onZoomWindow={updateZoomWindow}
            />
            {unavailable ? <p className="segment-telemetry-unavailable" role="status">{unavailable}</p> : null}
          </div>;
        })}
      </div>

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
            <div><dt>{t("lap.workbench.currentMeasuredAcceleration")}</dt><dd>{formatAccelerationSample(accelerationSample)}</dd></div>
            <div><dt>{t("lap.workbench.imuSync")}</dt><dd>{synchronizationLabel(synchronizedAcceleration, t)}</dd></div>
          </dl>
        </div>
      </div>
    </section>
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

function nearestAccelerationSample(
  series: SynchronizedAccelerationSeries | undefined,
  distanceMeters: number,
): SynchronizedAccelerationSeries["samples"][number] | undefined {
  return series?.samples.reduce<SynchronizedAccelerationSeries["samples"][number] | undefined>((nearest, sample) =>
    !nearest || Math.abs(sample.distanceMeters - distanceMeters) < Math.abs(nearest.distanceMeters - distanceMeters)
      ? sample
      : nearest,
  undefined);
}

function formatAccelerationSample(sample: SynchronizedAccelerationSeries["samples"][number] | undefined): string {
  if (!sample) return "—";
  return `Device X ${formatSignedG(sample.accelXG)} · Device Y ${formatSignedG(sample.accelYG)} · Device Z ${formatSignedG(sample.accelZG)}`;
}

function formatSignedG(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} g`;
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
