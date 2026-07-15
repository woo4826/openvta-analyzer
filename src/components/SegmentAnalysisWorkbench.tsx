import { useEffect, useMemo, useState } from "react";
import type { LineString } from "geojson";
import { Settings2 } from "lucide-react";
import { useSegmentWorkbench } from "../app/useSegmentWorkbench";
import type { ActiveSegment, GpsPoint, LapResult, MapSettings, TrackProfileV1 } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { SegmentLapTable } from "./SegmentLapTable";
import { SegmentScopeRibbon } from "./SegmentScopeRibbon";
import { SegmentTelemetryChart } from "./SegmentTelemetryChart";
import { SegmentTrajectoryMap } from "./SegmentTrajectoryMap";

interface SegmentAnalysisWorkbenchProps {
  points: GpsPoint[];
  laps: LapResult[];
  profile: TrackProfileV1;
  analysisLine: LineString;
  includePartialLapSections: boolean;
  onIncludePartialLapSections: (include: boolean) => void;
  mapSettings: MapSettings;
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  onMapSettingsChange: (settings: MapSettings) => void;
  onActiveSegment: (segment?: ActiveSegment) => void;
  onOpenSetup: () => void;
}

export function SegmentAnalysisWorkbench({
  points,
  laps,
  profile,
  analysisLine,
  includePartialLapSections,
  onIncludePartialLapSections,
  mapSettings,
  selectedPointIndex,
  onSelectedPointIndex,
  onMapSettingsChange,
  onActiveSegment,
  onOpenSetup,
}: SegmentAnalysisWorkbenchProps) {
  const { t } = useI18n();
  const workbench = useSegmentWorkbench({
    points,
    laps,
    analysisLine,
    sections: profile.sections,
    includePartialLapSections,
  });
  const [cursorDistanceMeters, setCursorDistanceMeters] = useState<number>();
  const [mobileView, setMobileView] = useState<"map" | "graphs" | "laps">("map");
  const focused = workbench.analysis.records.find((record) => record.lapId === workbench.focusedLapId);
  const scopeName = useMemo(() => {
    if (workbench.scope.kind === "whole-lap") return t("lap.workbench.wholeLap");
    if (workbench.scope.kind === "section") {
      const sectionId = workbench.scope.sectionId;
      return profile.sections.find((section) => section.id === sectionId)?.name ?? "Section";
    }
    return "Custom range";
  }, [profile.sections, t, workbench.scope]);

  useEffect(() => {
    onActiveSegment(workbench.activeSegment);
  }, [onActiveSegment, workbench.activeSegment]);

  return (
    <section className="segment-workbench lap-wide-panel" aria-label={t("lap.workbench.title")} data-mobile-view={mobileView}>
      <header className="segment-workbench-header">
        <div>
          <span className="panel-eyebrow">{profile.name}</span>
          <h2>{t("lap.workbench.question")}</h2>
          <p>{scopeName} · {Math.round(workbench.analysis.range.startDistanceMeters)}–{Math.round(workbench.analysis.range.endDistanceMeters)} m</p>
        </div>
        <div className="segment-workbench-actions">
          <div className="segmented-control" role="group" aria-label="Graph x axis">
            <button type="button" aria-pressed={workbench.axis === "distance"} onClick={() => workbench.setAxis("distance")}>{t("lap.workbench.distanceAxis")}</button>
            <button type="button" aria-pressed={workbench.axis === "time"} onClick={() => workbench.setAxis("time")}>{t("lap.workbench.timeAxis")}</button>
          </div>
          <button type="button" className="button" onClick={onOpenSetup}><Settings2 size={16} aria-hidden />{t("lap.workbench.setup")}</button>
        </div>
      </header>

      <SegmentScopeRibbon
        scope={workbench.scope}
        filter={workbench.filter}
        sections={workbench.navigationSections}
        onWholeLap={workbench.resetScope}
        onFilter={workbench.setFilter}
        onSection={workbench.selectSection}
      />

      <div className="segment-mobile-switch segmented-control" role="group" aria-label="Analysis view">
        {(["map", "graphs", "laps"] as const).map((view) => (
          <button key={view} type="button" aria-pressed={mobileView === view} onClick={() => setMobileView(view)}>{t(`lap.workbench.${view}`)}</button>
        ))}
      </div>

      <div className="segment-map-stage" data-workbench-pane="map">
        <SegmentTrajectoryMap
          analysis={workbench.analysis}
          points={points}
          centerline={profile.centerline}
          sections={profile.sections}
          settings={mapSettings}
          selectedIndex={selectedPointIndex}
          focusedLapId={workbench.focusedLapId}
          referenceLapId={workbench.referenceLapId}
          overlayLapIds={workbench.overlayLapIds}
          cursorDistanceMeters={cursorDistanceMeters}
          segment={workbench.activeSegment}
          onSelectedIndex={onSelectedPointIndex}
          onSectionSelect={workbench.selectSection}
          onSegmentChange={onActiveSegment}
          onSettingsChange={onMapSettingsChange}
        />
        <aside className="segment-evidence-panel" aria-label="Focused lap evidence">
          <span className="panel-eyebrow">{t("lap.workbench.focusedLap")}</span>
          <h3>{focused ? `Lap ${focused.ordinal}` : "—"}</h3>
          <dl>
            <Metric label={t("lap.duration")} value={formatTime(focused?.durationSeconds)} />
            <Metric label={t("lap.deltaBest")} value={formatDelta(focused?.deltaBestSeconds)} />
            <Metric label={t("lap.workbench.path")} value={focused?.drivenDistanceMeters === undefined ? "—" : `${focused.drivenDistanceMeters.toFixed(1)} m`} />
            <Metric label={t("lap.entrySpeed")} value={formatSpeed(focused?.entrySpeedKmh)} />
            <Metric label={t("lap.minimumSpeed")} value={formatSpeed(focused?.minimumSpeedKmh)} />
            <Metric label={t("lap.exitSpeed")} value={formatSpeed(focused?.exitSpeedKmh)} />
            <Metric label={t("lap.workbench.lossRate")} value={focused?.peakLossRateSecondsPer100m === undefined ? "—" : `+${focused.peakLossRateSecondsPer100m.toFixed(2)} s/100m`} />
            <Metric label={t("lap.workbench.gps")} value={focused?.gpsConfidence ?? "—"} />
          </dl>
        </aside>
      </div>

      <div data-workbench-pane="graphs">
        <SegmentTelemetryChart
          analysis={workbench.analysis}
          overlayLapIds={workbench.overlayLapIds}
          focusedLapId={workbench.focusedLapId}
          referenceLapId={workbench.referenceLapId}
          axis={workbench.axis}
          onRange={(start, end) => workbench.selectRange(start, end, "chart")}
          onReset={workbench.resetScope}
          onCursorDistance={setCursorDistanceMeters}
        />
      </div>

      <section className="panel segment-records-panel" data-workbench-pane="laps">
        <div className="panel-header">
          <div><span className="panel-eyebrow">{t("lap.workbench.scope")}</span><h3>{t("lap.workbench.records")}</h3></div>
          <label className="lap-option-check">
            <input type="checkbox" checked={includePartialLapSections} onChange={(event) => onIncludePartialLapSections(event.target.checked)} />
            <span>{t("lap.workbench.includePartial")}</span>
          </label>
        </div>
        <div className="panel-body">
          <SegmentLapTable
            records={workbench.analysis.records}
            focusedLapId={workbench.focusedLapId}
            referenceLapId={workbench.referenceLapId}
            fastestLapId={workbench.analysis.fastestLapId}
            shortestLapId={workbench.analysis.shortestLapId}
            onFocusedLap={workbench.setFocusedLap}
            onReferenceLap={workbench.setReferenceLap}
          />
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function formatDelta(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  return `${seconds > 0 ? "+" : ""}${seconds.toFixed(3)} s`;
}

function formatSpeed(speed: number | undefined): string {
  return speed === undefined ? "—" : `${speed.toFixed(1)} km/h`;
}
