import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AccelerationVectorMode,
  SynchronizedAccelerationSeries,
} from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { ChartPanel } from "./ChartPanel";
import {
  accelerationVectorSnapshot,
  buildAcceleration3dOption,
  buildAccelerationGgOption,
  type AccelerationVectorLabels,
  type AccelerationVectorSnapshot,
} from "./accelerationVectorOptions";

interface SegmentAccelerationVectorPanelProps {
  focused?: SynchronizedAccelerationSeries;
  reference?: SynchronizedAccelerationSeries;
  cursorDistanceMeters: number;
  mode: AccelerationVectorMode;
  onMode: (mode: AccelerationVectorMode) => void;
  describedBy?: string;
}

type GlState = "idle" | "loading" | "ready" | "error";

export function SegmentAccelerationVectorPanel({
  focused,
  reference,
  cursorDistanceMeters,
  mode,
  onMode,
  describedBy,
}: SegmentAccelerationVectorPanelProps) {
  const { t } = useI18n();
  const [glState, setGlState] = useState<GlState>("idle");
  const snapshot = useMemo(
    () => accelerationVectorSnapshot(focused, reference, cursorDistanceMeters),
    [cursorDistanceMeters, focused, reference],
  );
  const labels = useMemo<AccelerationVectorLabels>(() => ({
    deviceX: t("lap.workbench.chartImuAxisX"),
    deviceY: t("lap.workbench.chartImuAxisY"),
    deviceZ: t("lap.workbench.chartImuAxisZ"),
    focusedLap: t("lap.workbench.focusedLap"),
    referenceLap: t("lap.workbench.referenceLap"),
    localTrail: t("lap.workbench.accelerationLocalTrail"),
  }), [t]);
  const option2d = useMemo(() => buildAccelerationGgOption(snapshot, labels), [labels, snapshot]);
  const option3d = useMemo(() => buildAcceleration3dOption(snapshot, labels), [labels, snapshot]);

  useEffect(() => {
    if (mode !== "vector-3d") {
      setGlState("idle");
      return;
    }
    let active = true;
    setGlState("loading");
    import("echarts-gl").then(() => {
      if (active) setGlState("ready");
    }).catch(() => {
      if (active) setGlState("error");
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const actions = <ModeControls mode={mode} onMode={onMode} />;
  const readout = <AccelerationReadout snapshot={snapshot} />;
  const title = mode === "gg-2d"
    ? t("lap.workbench.accelerationGgTitle")
    : t("lap.workbench.acceleration3dTitle");

  if (!snapshot.focused) {
    return <div className="segment-acceleration-vector" data-testid="acceleration-vector-panel">
      <VectorPanelShell title={title} actions={actions}>
        <p className="segment-acceleration-state" role="status">{t("lap.workbench.measuredAccelerationUnavailable")}</p>
      </VectorPanelShell>
    </div>;
  }

  if (mode === "vector-3d" && glState !== "ready") {
    return <div className="segment-acceleration-vector" data-testid="acceleration-vector-panel">
      <VectorPanelShell title={title} actions={actions}>
        <div className="segment-acceleration-state" role="status">
          <p>{glState === "error"
            ? t("lap.workbench.acceleration3dUnavailable")
            : t("lap.workbench.acceleration3dLoading")}</p>
          {glState === "error" ? <button type="button" className="button" onClick={() => onMode("gg-2d")}>
            {t("lap.workbench.accelerationReturn2d")}
          </button> : null}
        </div>
        {readout}
      </VectorPanelShell>
    </div>;
  }

  return <div className="segment-acceleration-vector" data-testid="acceleration-vector-panel">
    <ChartPanel
      title={title}
      ariaLabel={mode === "gg-2d"
        ? t("lap.workbench.accelerationGgAria")
        : t("lap.workbench.acceleration3dAria")}
      className="segment-telemetry-metric segment-acceleration-vector-panel"
      option={mode === "gg-2d" ? option2d : option3d}
      actions={actions}
      caption={readout}
      describedBy={describedBy}
    />
  </div>;
}

function ModeControls({ mode, onMode }: {
  mode: AccelerationVectorMode;
  onMode: (mode: AccelerationVectorMode) => void;
}) {
  const { t } = useI18n();
  return <div className="segment-acceleration-mode-control" role="group" aria-label={t("lap.workbench.accelerationMode")}>
    <button type="button" aria-pressed={mode === "gg-2d"} onClick={() => onMode("gg-2d")}>
      {t("lap.workbench.accelerationMode2d")}
    </button>
    <button type="button" aria-pressed={mode === "vector-3d"} onClick={() => onMode("vector-3d")}>
      {t("lap.workbench.accelerationMode3d")}
    </button>
  </div>;
}

function AccelerationReadout({ snapshot }: { snapshot: AccelerationVectorSnapshot }) {
  const { t } = useI18n();
  const focused = snapshot.focused;
  if (!focused) return null;
  const magnitude = Math.hypot(focused.accelXG, focused.accelYG);
  return <div className="segment-acceleration-caption" aria-live="polite">
    <dl className="segment-acceleration-values">
      <AccelerationValue label={t("lap.workbench.chartImuAxisX")} value={formatSignedG(focused.accelXG)} />
      <AccelerationValue label={t("lap.workbench.chartImuAxisY")} value={formatSignedG(focused.accelYG)} />
      <AccelerationValue label={t("lap.workbench.chartImuAxisZ")} value={formatSignedG(focused.accelZG)} />
      <AccelerationValue label={t("lap.workbench.accelerationMagnitude")} value={`${magnitude.toFixed(2)} g`} />
    </dl>
    {snapshot.reference ? <p className="segment-acceleration-reference">
      {t("lap.workbench.accelerationReferenceValues", {
        x: formatSignedG(snapshot.reference.accelXG),
        y: formatSignedG(snapshot.reference.accelYG),
        z: formatSignedG(snapshot.reference.accelZG),
      })}
    </p> : <p className="segment-acceleration-reference is-unavailable">
      {t("lap.workbench.accelerationReferenceUnavailable")}
    </p>}
  </div>;
}

function AccelerationValue({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function VectorPanelShell({ title, actions, children }: {
  title: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return <section className="panel segment-telemetry-metric segment-acceleration-vector-panel">
    <div className="panel-header">
      <div><h3>{title}</h3></div>
      <div className="row-actions">{actions}</div>
    </div>
    <div className="panel-body">{children}</div>
  </section>;
}

function formatSignedG(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} g`;
}

export type { SegmentAccelerationVectorPanelProps };
