import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LineString } from "geojson";
import { Download, Save, Settings2 } from "lucide-react";
import { useSegmentWorkbench } from "../app/useSegmentWorkbench";
import { downloadText } from "../domain/export";
import { projectCoordinateToLineProgress, routeDistanceMeters } from "../domain/geometry";
import { segmentAnalysisCsv, segmentAnalysisJson } from "../domain/lapExport";
import { buildSegmentPairwiseEvidence } from "../domain/segmentPairwiseEvidence";
import {
  prepareAccelerationSynchronization,
  synchronizeAccelerationWithContext,
} from "../domain/sensorSynchronization";
import {
  canHideWidget,
  defaultSegmentWorkbenchPreferences,
  loadSegmentWorkbenchPreferences,
  saveSegmentWorkbenchPreferences,
} from "../domain/segmentWorkbenchPreferences";
import type {
  ActiveSegment,
  GpsPoint,
  LapResult,
  MapSettings,
  SegmentLapRecord,
  SegmentWidgetLayout,
  SegmentWorkbenchPreferences,
  SensorPoint,
  TrackProfileV1,
  TrackSectionKind,
} from "../domain/types";
import type { LapMapLayerOverrides } from "../domain/lapMapLayers";
import { useI18n } from "../i18n/useI18n";
import { SegmentLapTable } from "./SegmentLapTable";
import { SegmentTelemetryChart } from "./SegmentTelemetryChart";
import { SegmentTrajectoryMap } from "./SegmentTrajectoryMap";
import { SegmentVariationChart } from "./SegmentVariationChart";
import { SegmentWorkbenchControls } from "./SegmentWorkbenchControls";
import { SegmentScopeNavigator } from "./SegmentScopeNavigator";
import { SegmentDashboard } from "./SegmentDashboard";
import { DashboardWidget } from "./DashboardWidget";

interface SegmentAnalysisWorkbenchProps {
  active?: boolean;
  recordingId: string;
  sourceName: string;
  points: GpsPoint[];
  sensors: SensorPoint[];
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
  recordingId,
  sourceName,
  points,
  sensors,
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
  const [preferences, setPreferences] = useState<SegmentWorkbenchPreferences>(() => loadSegmentWorkbenchPreferences());
  const workbench = useSegmentWorkbench({
    points,
    laps,
    analysisLine,
    sections: profile.sections,
    includePartialLapSections,
    lapVisibility: preferences.lapVisibility,
  });
  const [cursorDistanceMeters, setCursorDistanceMeters] = useState<number>();
  const [lapLayerOverrides, setLapLayerOverrides] = useState<LapMapLayerOverrides>({});
  const telemetrySelectionRef = useRef<{ distanceMeters: number; sourceIndex: number }>();
  const [showRangeEditor, setShowRangeEditor] = useState(false);
  const [rangeName, setRangeName] = useState("");
  const [rangeKind, setRangeKind] = useState<TrackSectionKind>("corner-right");
  const [exportStatus, setExportStatus] = useState("");
  const focused = workbench.analysis.records.find((record) => record.lapId === workbench.focusedLapId);
  const reference = workbench.analysis.records.find((record) => record.lapId === workbench.referenceLapId);
  const pairwiseEvidence = useMemo(() => buildSegmentPairwiseEvidence(focused, reference), [focused, reference]);
  const accelerationSynchronizationContext = useMemo(
    () => prepareAccelerationSynchronization(points, sensors),
    [points, sensors],
  );
  const synchronizedAccelerationByLap = useMemo(() => Object.fromEntries(
    workbench.analysis.records.flatMap((record) => {
      if (!accelerationSynchronizationContext || !workbench.visibleLapIds.includes(record.lapId) || record.trajectory.length < 2) return [];
      const series = synchronizeAccelerationWithContext(accelerationSynchronizationContext, record.trajectory);
      return series ? [[record.lapId, series]] : [];
    }),
  ), [accelerationSynchronizationContext, workbench.analysis.records, workbench.visibleLapIds]);
  const recordingIdRef = useRef(recordingId);
  const totalDistanceMeters = useMemo(
    () => Math.max(1, routeDistanceMeters(analysisLine.coordinates)),
    [analysisLine],
  );
  const comparableCoverage = useMemo(
    () => comparableCoverageRange(focused, reference, workbench.analysis.range, analysisLine),
    [analysisLine, focused, reference, workbench.analysis.range],
  );
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
  const gpsQualityReason = focused ? focusedGpsQualityReason(focused, t) : undefined;
  const hasGpsQualityCaution = Boolean(focused && (
    focused.gpsConfidence === "low"
    || focused.gpsConfidence === "unknown"
    || focused.flags.includes("gps-gap")
  ));
  const partialImpact = partialCompletedSectorCount === 0
    ? t("lap.workbench.partialNoCandidates", { theoretical: theoreticalBestSeconds === undefined ? t("lap.workbench.notAvailable") : formatTime(theoreticalBestSeconds) })
    : t(includePartialLapSections ? "lap.workbench.partialIncludedImpact" : "lap.workbench.partialExcludedImpact", {
        eligible: partialEligibleSectorCount,
        completed: partialCompletedSectorCount,
        theoretical: theoreticalBestSeconds === undefined ? t("lap.workbench.notAvailable") : formatTime(theoreticalBestSeconds),
      });
  const focusOptions = workbench.analysis.records.filter((record) => record.trajectory.length > 1);
  const referenceOptions = workbench.analysis.records.filter((record) => record.completion === "complete" && record.eligibleForBest && record.trajectory.length > 1);
  const exportCsv = () => {
    const fileName = `${safeBaseName(sourceName)}.segment-analysis.csv`;
    downloadText(fileName, segmentAnalysisCsv(workbench.analysis), "text/csv");
    setExportStatus(t("lap.workbench.exportComplete", { file: fileName }));
  };
  const exportJson = () => {
    const fileName = `${safeBaseName(sourceName)}.segment-analysis.json`;
    downloadText(fileName, segmentAnalysisJson({
      sourceName,
      track: { id: profile.id, name: profile.name },
      includePartialLapSections,
      analysis: workbench.analysis,
    }), "application/json");
    setExportStatus(t("lap.workbench.exportComplete", { file: fileName }));
  };

  const updatePreferences = useCallback((update: (current: SegmentWorkbenchPreferences) => SegmentWorkbenchPreferences) => {
    setPreferences((current) => update(current));
  }, []);

  const updateLayouts = useCallback((layouts: Record<string, SegmentWidgetLayout[]>) => {
    updatePreferences((current) => JSON.stringify(current.layouts) === JSON.stringify(layouts)
      ? current
      : { ...current, layouts });
  }, [updatePreferences]);
  const controlsOpen = active && preferences.drawerOpen;

  useEffect(() => {
    if (!active) return;
    onActiveSegment(workbench.activeSegment);
  }, [active, onActiveSegment, workbench.activeSegment]);

  useEffect(() => {
    if (active || !preferences.drawerOpen) return;
    updatePreferences((current) => current.drawerOpen ? { ...current, drawerOpen: false } : current);
  }, [active, preferences.drawerOpen, updatePreferences]);

  useEffect(() => {
    saveSegmentWorkbenchPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (recordingIdRef.current === recordingId) return;
    recordingIdRef.current = recordingId;
    setLapLayerOverrides({});
    setExportStatus("");
  }, [recordingId]);

  useEffect(() => {
    if (!active) return;
    const telemetrySelection = telemetrySelectionRef.current;
    if (telemetrySelection?.sourceIndex === selectedPointIndex) {
      telemetrySelectionRef.current = undefined;
      return;
    }
    telemetrySelectionRef.current = undefined;
    const selected = focused?.trajectory.find((sample) => sample.sourceIndex === selectedPointIndex);
    const next = selected ?? focused?.trajectory[0];
    if (!next) return;
    setCursorDistanceMeters(next.distanceMeters);
    if (!selected) onSelectedPointIndex(next.sourceIndex);
  }, [active, focused?.trajectory, onSelectedPointIndex, selectedPointIndex]);

  const selectMapPoint = useCallback((sourceIndex: number) => {
    telemetrySelectionRef.current = undefined;
    const sample = nearestSourceSample(focused?.trajectory ?? [], sourceIndex);
    if (sample) setCursorDistanceMeters(sample.distanceMeters);
    onSelectedPointIndex(sourceIndex);
  }, [focused?.trajectory, onSelectedPointIndex]);

  const selectTelemetryCursor = useCallback((distanceMeters: number, sourceIndex: number) => {
    telemetrySelectionRef.current = { distanceMeters, sourceIndex };
    setCursorDistanceMeters(distanceMeters);
    onSelectedPointIndex(sourceIndex);
  }, [onSelectedPointIndex]);

  return (
    <section className={`segment-workbench lap-wide-panel${controlsOpen ? " is-controls-open" : ""}`} aria-label={t("lap.workbench.title")}>
      <header className="segment-workbench-header">
        <div>
          <span className="panel-eyebrow">{t("lap.workbench.title")}</span>
          <h2>{profile.name}</h2>
          <p>{scopeName} · {Math.round(workbench.analysis.range.startDistanceMeters)}–{Math.round(workbench.analysis.range.endDistanceMeters)} m</p>
        </div>
        <div className="segment-workbench-actions">
          {workbench.scope.kind === "range" ? (
            <button type="button" className="button" onClick={() => setShowRangeEditor((visible) => !visible)}><Save size={16} aria-hidden />{t("lap.workbench.saveRange")}</button>
          ) : null}
          <button
            type="button"
            className="button"
            onClick={exportCsv}
          >
            <Download size={16} aria-hidden />{t("lap.workbench.exportCsv")}
          </button>
          <button
            type="button"
            className="button"
            onClick={exportJson}
          >
            <Download size={16} aria-hidden />{t("lap.workbench.exportJson")}
          </button>
          <button type="button" className="button" onClick={onOpenSetup}><Settings2 size={16} aria-hidden />{t("lap.workbench.setup")}</button>
        </div>
      </header>
      <p className="segment-export-status" role="status" aria-live="polite">{exportStatus}</p>

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

      <div className="segment-sticky-stack">
      <div className="segment-comparison-bar" aria-label={t("lap.workbench.comparisonControls")}>
        <label className="comparison-role is-focus">
          <span><i aria-hidden />{t("lap.workbench.focusedLap")}</span>
          <select aria-label={t("lap.workbench.focusedLap")} value={workbench.focusedLapId ?? ""} onChange={(event) => workbench.setFocusedLap(event.target.value)}>
            {focusOptions.map((record) => <option key={record.lapId} value={record.lapId}>{lapControlLabel(record, t)}</option>)}
          </select>
        </label>
        <span className="comparison-separator" aria-hidden>↔</span>
        <label className="comparison-role is-reference">
          <span><i aria-hidden />{t("lap.workbench.referenceLap")}</span>
          <select aria-label={t("lap.workbench.referenceLap")} value={workbench.referenceLapId ?? ""} onChange={(event) => workbench.setReferenceLap(event.target.value)}>
            {referenceOptions.map((record) => <option key={record.lapId} value={record.lapId}>{lapControlLabel(record, t)}</option>)}
          </select>
        </label>
        <div className="comparison-scope">
          <small>{t("lap.workbench.selectedScope")}</small>
          <strong>{scopeName}</strong>
          <span>{t("lap.workbench.trackDefinition")}: {Math.round(totalDistanceMeters)} m · {t("lap.workbench.comparableCoverage")}: {comparableCoverage
            ? `${Math.round(comparableCoverage.startDistanceMeters)}–${Math.round(comparableCoverage.endDistanceMeters)} m${comparableCoverage.incomplete ? ` · ${t("lap.workbench.comparableCoverageIncomplete")}` : ""}`
            : t("lap.workbench.noCoverage")}</span>
        </div>
        <div className="comparison-delta" aria-label={t("lap.workbench.pairwiseDelta")}>
          <small>{t("lap.workbench.pairwiseDelta")}</small>
          <strong className={pairwiseDeltaTone(pairwiseEvidence?.timeDeltaSeconds)}>{formatPairwiseTime(pairwiseEvidence?.timeDeltaSeconds, t)}</strong>
        </div>
        <SegmentWorkbenchControls
          open={controlsOpen}
          lapVisibility={preferences.lapVisibility}
          axis={workbench.axis}
          includePartialLapSections={includePartialLapSections}
          partialImpact={partialImpact}
          snapToSections={preferences.snapToSections}
          visibleWidgets={preferences.visibleWidgets}
          onOpenChange={(drawerOpen) => updatePreferences((current) => ({ ...current, drawerOpen }))}
          onLapVisibility={(lapVisibility) => updatePreferences((current) => ({ ...current, lapVisibility }))}
          onAxis={workbench.setAxis}
          onIncludePartialLapSections={onIncludePartialLapSections}
          onSnapToSections={(snapToSections) => updatePreferences((current) => ({ ...current, snapToSections }))}
          onWidgetVisibility={(widgetId, visible) => updatePreferences((current) => {
            if (!visible && !canHideWidget(current.visibleWidgets, widgetId)) return current;
            return { ...current, visibleWidgets: { ...current.visibleWidgets, [widgetId]: visible } };
          })}
          onResetLayout={() => updatePreferences((current) => ({
            ...current,
            layouts: defaultSegmentWorkbenchPreferences().layouts,
          }))}
        />
        <span className="sr-only" role="status" aria-live="polite">{focused ? workbenchLapLabel(focused, t) : "—"} {t("lap.workbench.focusVs")} {reference ? workbenchLapLabel(reference, t) : "—"} · {scopeName}</span>
      </div>

      <SegmentScopeNavigator
        scope={workbench.scope}
        filter={workbench.filter}
        sections={profile.sections}
        totalDistanceMeters={totalDistanceMeters}
        snapToSections={preferences.snapToSections}
        onWholeLap={workbench.resetScope}
        onFilter={workbench.setFilter}
        onSection={workbench.selectSection}
        onRange={(start, end) => workbench.selectRange(start, end, "manual")}
      />
      </div>

      {active ? <>
      <SegmentDashboard
        layouts={preferences.layouts}
        visibleWidgets={preferences.visibleWidgets}
        onLayouts={updateLayouts}
      >
        {{
          map: (
            <DashboardWidget id="map" title={t("lap.workbench.widget.map")}>
              <SegmentTrajectoryMap
                analysis={workbench.analysis}
                points={points}
                centerline={profile.centerline}
                sections={profile.sections}
                settings={mapSettings}
                selectedIndex={selectedPointIndex}
                focusedLapId={workbench.focusedLapId}
                referenceLapId={workbench.referenceLapId}
                cursorDistanceMeters={cursorDistanceMeters}
                lapLayerOverrides={lapLayerOverrides}
                onLapLayerOverrides={setLapLayerOverrides}
                segment={workbench.scope.kind === "whole-lap" ? undefined : workbench.activeSegment}
                onSelectedIndex={selectMapPoint}
                onSectionSelect={workbench.selectSection}
                onSegmentChange={selectMapSegment}
                onSettingsChange={onMapSettingsChange}
              />
            </DashboardWidget>
          ),
          evidence: (
            <DashboardWidget id="evidence" title={t("lap.workbench.widget.evidence")}>
              <aside className="segment-evidence-panel" aria-label={t("lap.workbench.focusedEvidence")}>
                <section className="segment-pairwise-evidence" aria-label={t("lap.workbench.pairwiseEvidence")}>
                  <span className="panel-eyebrow">{t("lap.workbench.pairwiseDelta")}</span>
                  <h3>{focused ? workbenchLapLabel(focused, t) : "—"} ↔ {reference ? workbenchLapLabel(reference, t) : "—"}</h3>
                  <dl>
                    <Metric label={t("lap.workbench.timeDifference")} value={formatPairwiseTime(pairwiseEvidence?.timeDeltaSeconds, t)} />
                    <Metric label={t("lap.entrySpeed")} value={formatSigned(pairwiseEvidence?.entrySpeedDeltaKmh, "km/h")} />
                    <Metric label={t("lap.minimumSpeed")} value={formatSigned(pairwiseEvidence?.minimumSpeedDeltaKmh, "km/h")} />
                    <Metric label={t("lap.exitSpeed")} value={formatSigned(pairwiseEvidence?.exitSpeedDeltaKmh, "km/h")} />
                    <Metric label={t("lap.workbench.pathDifference")} value={formatSigned(pairwiseEvidence?.drivenDistanceDeltaMeters, "m")} />
                  </dl>
                </section>
                <span className="panel-eyebrow">{t("lap.workbench.focusedLap")}</span>
                <h3>{focused ? workbenchLapLabel(focused, t) : "—"}</h3>
                <dl>
                  <Metric label={t("lap.duration")} value={formatTime(focused?.durationSeconds)} />
                  <Metric label={t("lap.workbench.sessionBestDelta")} value={formatDelta(focused?.deltaBestSeconds)} />
                  <Metric label={t("lap.workbench.path")} value={focused?.drivenDistanceMeters === undefined ? "—" : `${focused.drivenDistanceMeters.toFixed(1)} m`} />
                  <Metric label={t("lap.entrySpeed")} value={formatSpeed(focused?.entrySpeedKmh)} />
                  <Metric label={t("lap.minimumSpeed")} value={formatSpeed(focused?.minimumSpeedKmh)} />
                  <Metric label={t("lap.exitSpeed")} value={formatSpeed(focused?.exitSpeedKmh)} />
                  <Metric label={t("lap.workbench.lossRate")} value={focused?.peakLossRateSecondsPer100m === undefined ? "—" : `+${focused.peakLossRateSecondsPer100m.toFixed(2)} s/100m`} />
                  <Metric label={t("lap.workbench.gps")} value={focused ? gpsConfidenceLabel(focused.gpsConfidence, t) : "—"} />
                </dl>
                <div className={`segment-coach-card ${coachCue.actionable ? "is-actionable" : "is-caution"}`}>
                  <span className="panel-eyebrow">{t("lap.workbench.nextRun")}</span>
                  <strong>{hasGpsQualityCaution ? gpsQualityReason : coachCue.evidence}</strong>
                  <p>{coachCue.action}</p>
                  {coachCue.verification ? <small>{t("lap.workbench.verifyNext")}: {coachCue.verification}</small> : null}
                  {hasGpsQualityCaution ? <button type="button" className="button" onClick={onOpenSetup}>{t("lap.workbench.openTrackSetup")}</button> : null}
                </div>
              </aside>
            </DashboardWidget>
          ),
          variation: (
            <DashboardWidget id="variation" title={t("lap.workbench.widget.variation")}>
              <SegmentVariationChart
                analysis={workbench.analysis}
                focusedLapId={workbench.focusedLapId}
                referenceLapId={workbench.referenceLapId}
                visibleLapIds={workbench.visibleLapIds}
              />
            </DashboardWidget>
          ),
          telemetry: (
            <DashboardWidget id="telemetry" title={t("lap.workbench.widget.telemetry")}>
              <SegmentTelemetryChart
                analysis={workbench.analysis}
                visibleLapIds={workbench.visibleLapIds}
                focusedLapId={workbench.focusedLapId}
                referenceLapId={workbench.referenceLapId}
                axis={workbench.axis}
                synchronizedAccelerationByLap={synchronizedAccelerationByLap}
                cursorDistanceMeters={cursorDistanceMeters}
                layout={preferences.telemetryLayout}
                onLayout={(telemetryLayout) => updatePreferences((current) => ({ ...current, telemetryLayout }))}
                onCursor={selectTelemetryCursor}
              />
            </DashboardWidget>
          ),
          laps: (
            <DashboardWidget id="laps" title={t("lap.workbench.widget.laps")}>
              <section className="panel segment-records-panel">
                <div className="panel-body">
                  <SegmentLapTable
                    records={workbench.analysis.records.filter((record) => workbench.visibleLapIds.includes(record.lapId))}
                    focusedLapId={workbench.focusedLapId}
                    referenceLapId={workbench.referenceLapId}
                    fastestLapId={workbench.analysis.fastestLapId}
                    shortestLapId={workbench.analysis.shortestLapId}
                    onFocusedLap={workbench.setFocusedLap}
                    onReferenceLap={workbench.setReferenceLap}
                  />
                </div>
              </section>
            </DashboardWidget>
          ),
        }}
      </SegmentDashboard>
      </> : null}
    </section>
  );
}

function nearestSourceSample(
  samples: SegmentLapRecord["trajectory"],
  sourceIndex: number,
) {
  return samples.reduce<(typeof samples)[number] | undefined>((nearest, sample) =>
    !nearest || Math.abs(sample.sourceIndex - sourceIndex) < Math.abs(nearest.sourceIndex - sourceIndex)
      ? sample
      : nearest,
  undefined);
}

function comparableCoverageRange(
  focused: SegmentLapRecord | undefined,
  reference: SegmentLapRecord | undefined,
  requested: { startDistanceMeters: number; endDistanceMeters: number },
  analysisLine: LineString,
): { startDistanceMeters: number; endDistanceMeters: number; incomplete: boolean } | undefined {
  const records = [focused, reference].filter((record): record is SegmentLapRecord => Boolean(record?.trajectory.length));
  if (!records.length) return undefined;
  const starts = records.map((record) => {
    if (record.coverage === "complete") return requested.startDistanceMeters;
    const first = record.trajectory[0];
    return projectCoordinateToLineProgress([first.longitude, first.latitude], analysisLine).distanceMeters;
  });
  const spans = records.map((record) => {
    const first = record.trajectory[0];
    const last = record.trajectory.at(-1)!;
    return Math.max(0, last.distanceMeters - first.distanceMeters);
  });
  const startDistanceMeters = Math.max(requested.startDistanceMeters, ...starts);
  const endDistanceMeters = Math.min(requested.endDistanceMeters, startDistanceMeters + Math.min(...spans));
  if (endDistanceMeters <= startDistanceMeters) return undefined;
  return {
    startDistanceMeters,
    endDistanceMeters,
    incomplete: records.some((record) => record.coverage !== "complete")
      || startDistanceMeters > requested.startDistanceMeters + 2
      || endDistanceMeters < requested.endDistanceMeters - 2,
  };
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

function formatSigned(value: number | undefined, unit: string): string {
  if (value === undefined) return "—";
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(unit === "m" ? 1 : 1)} ${unit}`;
}

function formatPairwiseTime(seconds: number | undefined, t: T): string {
  if (seconds === undefined) return "—";
  const direction = seconds < -0.0005
    ? t("lap.workbench.ahead")
    : seconds > 0.0005
      ? t("lap.workbench.behind")
      : t("lap.workbench.even");
  return `${formatDelta(seconds)} · ${direction}`;
}

function pairwiseDeltaTone(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined;
  return seconds > 0.0005 ? "delta-loss" : "delta-best";
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

function lapControlLabel(record: SegmentLapRecord, t: T): string {
  return `${workbenchLapLabel(record, t)} · ${formatTime(record.durationSeconds)}`;
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

function focusedGpsQualityReason(record: SegmentLapRecord, t: T): string {
  if (record.flags.includes("gps-gap")) return t("lap.workbench.qualityGpsGap");
  if (record.gpsConfidence === "low") return t("lap.workbench.qualityGpsLow");
  if (record.gpsConfidence === "unknown") return t("lap.workbench.qualityGpsUnknown");
  return t("lap.workbench.qualityGpsUsable", { confidence: gpsConfidenceLabel(record.gpsConfidence, t) });
}

function buildCoachCue(scope: string, focused: SegmentLapRecord | undefined, reference: SegmentLapRecord | undefined, t: T) {
  if (!focused || !reference) {
    return { actionable: false, evidence: t("lap.workbench.coachUnavailable"), action: t("lap.workbench.chooseComparableLaps") };
  }
  if (focused.gpsConfidence === "low" || focused.gpsConfidence === "unknown" || focused.flags.includes("gps-gap")) {
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
