import { useCallback, useEffect, useMemo, useState } from "react";
import type { LineString } from "geojson";
import { Download, Save, Settings2 } from "lucide-react";
import { useSegmentWorkbench } from "../app/useSegmentWorkbench";
import { downloadText } from "../domain/export";
import { projectCoordinateToLineProgress } from "../domain/geometry";
import { segmentAnalysisCsv, segmentAnalysisJson } from "../domain/lapExport";
import type { ActiveSegment, GpsPoint, LapResult, MapSettings, SegmentLapRecord, TrackProfileV1, TrackSectionKind } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { SegmentLapTable } from "./SegmentLapTable";
import { SegmentOpportunityRanking } from "./SegmentOpportunityRanking";
import { SegmentScopeRibbon } from "./SegmentScopeRibbon";
import { SegmentTelemetryChart } from "./SegmentTelemetryChart";
import { SegmentTrajectoryMap } from "./SegmentTrajectoryMap";
import { SegmentVariationChart } from "./SegmentVariationChart";

interface SegmentAnalysisWorkbenchProps {
  active?: boolean;
  sourceName: string;
  points: GpsPoint[];
  laps: LapResult[];
  profile: TrackProfileV1;
  analysisLine: LineString;
  includePartialLapSections: boolean;
  partialCompletedSectorCount?: number;
  partialEligibleSectorCount?: number;
  theoreticalBestSeconds?: number;
  onIncludePartialLapSections: (include: boolean) => void;
  mapSettings: MapSettings;
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  onMapSettingsChange: (settings: MapSettings) => void;
  onActiveSegment: (segment?: ActiveSegment) => void;
  onSaveRange: (startDistanceMeters: number, endDistanceMeters: number, name: string, kind: TrackSectionKind) => void;
  onOpenSetup: () => void;
}

export function SegmentAnalysisWorkbench({
  active = true,
  sourceName,
  points,
  laps,
  profile,
  analysisLine,
  includePartialLapSections,
  partialCompletedSectorCount = 0,
  partialEligibleSectorCount = 0,
  theoreticalBestSeconds,
  onIncludePartialLapSections,
  mapSettings,
  selectedPointIndex,
  onSelectedPointIndex,
  onMapSettingsChange,
  onActiveSegment,
  onSaveRange,
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
  const [showRangeEditor, setShowRangeEditor] = useState(false);
  const [rangeName, setRangeName] = useState("");
  const [rangeKind, setRangeKind] = useState<TrackSectionKind>("corner-right");
  const focused = workbench.analysis.records.find((record) => record.lapId === workbench.focusedLapId);
  const reference = workbench.analysis.records.find((record) => record.lapId === workbench.referenceLapId);
  const visibleSectionIds = useMemo(() => new Set(workbench.navigationSections.map((section) => section.id)), [workbench.navigationSections]);
  const visibleOpportunities = useMemo(() => workbench.opportunities.filter((opportunity) =>
    visibleSectionIds.has(opportunity.section.id)), [visibleSectionIds, workbench.opportunities]);
  const lossesBySection = useMemo(() => Object.fromEntries(workbench.opportunities.map((opportunity) => [
    opportunity.section.id,
    opportunity.timeDeltaSeconds,
  ])), [workbench.opportunities]);
  const selectMapSegment = useCallback((segment?: ActiveSegment) => {
    if (!segment) {
      workbench.resetScope();
      return;
    }
    const start = points[segment.startIndex];
    const end = points[segment.endIndex];
    if (!start || !end) return;
    const startDistanceMeters = projectCoordinateToLineProgress(
      [start.longitude, start.latitude],
      analysisLine,
    ).distanceMeters;
    const endDistanceMeters = projectCoordinateToLineProgress(
      [end.longitude, end.latitude],
      analysisLine,
    ).distanceMeters;
    workbench.selectRange(startDistanceMeters, endDistanceMeters, "map");
  }, [analysisLine, points, workbench]);
  const scopeName = useMemo(() => {
    if (workbench.scope.kind === "whole-lap") return t("lap.workbench.wholeLap");
    if (workbench.scope.kind === "section") {
      const sectionId = workbench.scope.sectionId;
      return profile.sections.find((section) => section.id === sectionId)?.name ?? t("lap.section");
    }
    return t("lap.workbench.customRange");
  }, [profile.sections, t, workbench.scope]);
  const coachCue = useMemo(() => buildCoachCue(scopeName, focused, reference, t), [focused, reference, scopeName, t]);

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
          <div className="segmented-control" role="group" aria-label={t("lap.workbench.graphAxis")}>
            <button type="button" aria-pressed={workbench.axis === "distance"} onClick={() => workbench.setAxis("distance")}>{t("lap.workbench.distanceAxis")}</button>
            <button type="button" aria-pressed={workbench.axis === "time"} onClick={() => workbench.setAxis("time")}>{t("lap.workbench.timeAxis")}</button>
          </div>
          {workbench.scope.kind === "range" ? (
            <button type="button" className="button" onClick={() => setShowRangeEditor((visible) => !visible)}><Save size={16} aria-hidden />{t("lap.workbench.saveRange")}</button>
          ) : null}
          <button
            type="button"
            className="button"
            onClick={() => downloadText(`${safeBaseName(sourceName)}.segment-analysis.csv`, segmentAnalysisCsv(workbench.analysis), "text/csv")}
          >
            <Download size={16} aria-hidden />{t("lap.workbench.exportCsv")}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => downloadText(`${safeBaseName(sourceName)}.segment-analysis.json`, segmentAnalysisJson({
              sourceName,
              track: { id: profile.id, name: profile.name },
              includePartialLapSections,
              analysis: workbench.analysis,
            }), "application/json")}
          >
            <Download size={16} aria-hidden />{t("lap.workbench.exportJson")}
          </button>
          <button type="button" className="button" onClick={onOpenSetup}><Settings2 size={16} aria-hidden />{t("lap.workbench.setup")}</button>
        </div>
      </header>

      {workbench.scope.kind === "range" && showRangeEditor ? (
        <form
          className="segment-range-editor"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveRange(
              workbench.analysis.range.startDistanceMeters,
              workbench.analysis.range.endDistanceMeters,
              rangeName,
              rangeKind,
            );
            setShowRangeEditor(false);
            setRangeName("");
          }}
        >
          <div>
            <span className="panel-eyebrow">{t("lap.workbench.customRange")}</span>
            <strong>{Math.round(workbench.analysis.range.startDistanceMeters)}–{Math.round(workbench.analysis.range.endDistanceMeters)} m</strong>
          </div>
          <label className="field">
            <span>{t("lap.workbench.segmentName")}</span>
            <input autoFocus value={rangeName} onChange={(event) => setRangeName(event.target.value)} placeholder={t("lap.workbench.segmentNamePlaceholder")} />
          </label>
          <label className="field">
            <span>{t("lap.kind")}</span>
            <select value={rangeKind} onChange={(event) => setRangeKind(event.target.value as TrackSectionKind)}>
              <option value="corner-left">{t("lap.cornerLeft")}</option>
              <option value="corner-right">{t("lap.cornerRight")}</option>
              <option value="straight">{t("lap.straight")}</option>
            </select>
          </label>
          <div className="row-actions">
            <button type="submit" className="button primary">{t("lap.workbench.saveSegment")}</button>
            <button type="button" className="button ghost" onClick={() => setShowRangeEditor(false)}>{t("lap.workbench.cancel")}</button>
          </div>
        </form>
      ) : null}

      <div className="segment-comparison-bar" aria-label={t("lap.workbench.comparisonControls")}>
        <label className="comparison-role is-focus">
          <span><i aria-hidden />{t("lap.workbench.focusedLap")}</span>
          <select aria-label={t("lap.workbench.focusedLap")} value={workbench.focusedLapId ?? ""} onChange={(event) => workbench.setFocusedLap(event.target.value)}>
            {workbench.analysis.records.map((record) => <option key={record.lapId} value={record.lapId}>{workbenchLapLabel(record, t)}</option>)}
          </select>
        </label>
        <span className="comparison-separator" aria-hidden>↔</span>
        <label className="comparison-role is-reference">
          <span><i aria-hidden />{t("lap.workbench.referenceLap")}</span>
          <select aria-label={t("lap.workbench.referenceLap")} value={workbench.referenceLapId ?? ""} onChange={(event) => workbench.setReferenceLap(event.target.value)}>
            {workbench.analysis.records.filter((record) => record.completion === "complete" && record.eligibleForBest).map((record) => <option key={record.lapId} value={record.lapId}>{workbenchLapLabel(record, t)}</option>)}
          </select>
        </label>
        <span className="comparison-scope"><small>{t("lap.workbench.selectedScope")}</small><strong>{scopeName}</strong></span>
        <span className="sr-only" role="status" aria-live="polite">{focused ? workbenchLapLabel(focused, t) : "—"} {t("lap.workbench.focusVs")} {reference ? workbenchLapLabel(reference, t) : "—"} · {scopeName}</span>
      </div>

      <SegmentScopeRibbon
        scope={workbench.scope}
        filter={workbench.filter}
        sections={workbench.navigationSections}
        losses={lossesBySection}
        onWholeLap={workbench.resetScope}
        onFilter={workbench.setFilter}
        onSection={workbench.selectSection}
      />

      {active ? <>
      <div className="segment-mobile-switch segmented-control" role="group" aria-label={t("lap.workbench.analysisView")}>
        {(["map", "graphs", "laps"] as const).map((view) => (
          <button key={view} type="button" aria-pressed={mobileView === view} onClick={() => setMobileView(view)}>{t(`lap.workbench.${view}`)}</button>
        ))}
      </div>

      <div data-workbench-pane="map">
        <SegmentOpportunityRanking
          opportunities={visibleOpportunities}
          scope={workbench.scope}
          focusedLapOrdinal={focused?.ordinal}
          referenceLapOrdinal={reference?.ordinal}
          onSection={workbench.selectSection}
        />
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
          onSegmentChange={selectMapSegment}
          onSettingsChange={onMapSettingsChange}
        />
        <aside className="segment-evidence-panel" aria-label={t("lap.workbench.focusedEvidence")}>
          <span className="panel-eyebrow">{t("lap.workbench.focusedLap")}</span>
          <h3>{focused ? workbenchLapLabel(focused, t) : "—"}</h3>
          <dl>
            <Metric label={t("lap.duration")} value={formatTime(focused?.durationSeconds)} />
            <Metric label={t("lap.deltaBest")} value={formatDelta(focused?.deltaBestSeconds)} />
            <Metric label={t("lap.workbench.path")} value={focused?.drivenDistanceMeters === undefined ? "—" : `${focused.drivenDistanceMeters.toFixed(1)} m`} />
            <Metric label={t("lap.entrySpeed")} value={formatSpeed(focused?.entrySpeedKmh)} />
            <Metric label={t("lap.minimumSpeed")} value={formatSpeed(focused?.minimumSpeedKmh)} />
            <Metric label={t("lap.exitSpeed")} value={formatSpeed(focused?.exitSpeedKmh)} />
            <Metric label={t("lap.workbench.lossRate")} value={focused?.peakLossRateSecondsPer100m === undefined ? "—" : `+${focused.peakLossRateSecondsPer100m.toFixed(2)} s/100m`} />
            <Metric label={t("lap.workbench.gps")} value={focused ? gpsConfidenceLabel(focused.gpsConfidence, t) : "—"} />
          </dl>
          <div className={`segment-coach-card ${coachCue.actionable ? "is-actionable" : "is-caution"}`}>
            <span className="panel-eyebrow">{t("lap.workbench.nextRun")}</span>
            <strong>{coachCue.evidence}</strong>
            <p>{coachCue.action}</p>
            {coachCue.verification ? <small>{t("lap.workbench.verifyNext")}: {coachCue.verification}</small> : null}
          </div>
        </aside>
      </div>

      <div className="segment-graphs-stack" data-workbench-pane="graphs">
        <SegmentVariationChart
          analysis={workbench.analysis}
          focusedLapId={workbench.focusedLapId}
          referenceLapId={workbench.referenceLapId}
        />
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
          <p className="partial-policy-impact" aria-live="polite">
            {partialCompletedSectorCount === 0
              ? t("lap.workbench.partialNoCandidates", { theoretical: theoreticalBestSeconds === undefined ? t("lap.workbench.notAvailable") : formatTime(theoreticalBestSeconds) })
              : t(includePartialLapSections ? "lap.workbench.partialIncludedImpact" : "lap.workbench.partialExcludedImpact", {
                  eligible: partialEligibleSectorCount,
                  completed: partialCompletedSectorCount,
                  theoretical: theoreticalBestSeconds === undefined ? t("lap.workbench.notAvailable") : formatTime(theoreticalBestSeconds),
                })}
          </p>
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
      </> : null}
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

function safeBaseName(name: string): string {
  return name.replace(/\.vta$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "openvta";
}

type T = ReturnType<typeof useI18n>["t"];

function workbenchLapLabel(record: SegmentLapRecord, t: T): string {
  if (record.completion === "partial-start") return t("lap.workbench.openingFragment");
  if (record.completion === "partial-end") return t("lap.workbench.closingFragment");
  if (record.completion === "partial-both") return t("lap.workbench.incompleteRecording");
  return `${t("lap.lap")} ${record.ordinal}`;
}

function gpsConfidenceLabel(confidence: SegmentLapRecord["gpsConfidence"], t: T): string {
  const keys = {
    high: "lap.workbench.gpsHigh",
    medium: "lap.workbench.gpsMedium",
    low: "lap.workbench.gpsLow",
    unknown: "lap.workbench.gpsUnknown",
  } as const;
  return t(keys[confidence]);
}

function buildCoachCue(scope: string, focused: SegmentLapRecord | undefined, reference: SegmentLapRecord | undefined, t: T) {
  if (!focused || !reference) {
    return { actionable: false, evidence: t("lap.workbench.coachUnavailable"), action: t("lap.workbench.chooseComparableLaps") };
  }
  if (focused.gpsConfidence === "low" || focused.flags.includes("gps-gap")) {
    return { actionable: false, evidence: t("lap.workbench.coachGpsCaution"), action: t("lap.workbench.coachGpsAction") };
  }
  const metrics = [
    { label: t("lap.entrySpeed"), focused: focused.entrySpeedKmh, reference: reference.entrySpeedKmh },
    { label: t("lap.minimumSpeed"), focused: focused.minimumSpeedKmh, reference: reference.minimumSpeedKmh },
    { label: t("lap.exitSpeed"), focused: focused.exitSpeedKmh, reference: reference.exitSpeedKmh },
  ].flatMap((metric) => metric.focused === undefined || metric.reference === undefined ? [] : [{
    ...metric,
    delta: metric.focused - metric.reference,
  }]);
  const largestDeficit = metrics.sort((left, right) => left.delta - right.delta)[0];
  if (!largestDeficit || largestDeficit.delta >= -0.5) {
    return {
      actionable: false,
      evidence: t("lap.workbench.noClearSpeedDeficit"),
      action: t("lap.workbench.inspectDeltaShape"),
    };
  }
  return {
    actionable: true,
    evidence: t("lap.workbench.measuredDeficit", { metric: largestDeficit.label, delta: largestDeficit.delta.toFixed(1) }),
    action: t("lap.workbench.nextRunTarget", { scope, metric: largestDeficit.label, target: Number(largestDeficit.reference).toFixed(1) }),
    verification: t("lap.workbench.nextRunVerification", { metric: largestDeficit.label }),
  };
}
