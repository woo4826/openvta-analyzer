import { useEffect, useMemo, useState } from "react";
import { Download, Flag, MapPinned, Scissors, Upload } from "lucide-react";
import type { LapWorkspace } from "../app/useLapWorkspace";
import { analyzeCorners } from "../domain/lapAnalysis";
import { downloadText } from "../domain/export";
import {
  cornerResultsCsv,
  lapAnalysisJson,
  lapResultsCsv,
  sectionResultsCsv,
  sectorResultsCsv,
} from "../domain/lapExport";
import { exportTrackProfile } from "../domain/trackProfile";
import type {
  ActiveSegment,
  GpsPoint,
  LapResult,
  MapSettings,
  SensorPoint,
  SourceVisibility,
  TrackGate,
  TrackSection,
} from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import type { Translate } from "../i18n/messages";
import type { TranslationKey } from "../i18n/locales";
import { SegmentAnalysisWorkbench } from "./SegmentAnalysisWorkbench";
import { PointTimeline } from "./PointTimeline";
import { RouteMap, type LapMapOverlay } from "./RouteMap";
import { FilePickerButton, Panel, StatusBadge, Tabs } from "./ui";

interface LapAnalysisProps {
  active?: boolean;
  fileName: string;
  points: GpsPoint[];
  sensors: SensorPoint[];
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  sourceVisibility: SourceVisibility;
  mapSettings: MapSettings;
  onMapSettingsChange: (settings: MapSettings) => void;
  activeSegment?: ActiveSegment;
  onActiveSegment: (segment?: ActiveSegment) => void;
  workspace: LapWorkspace;
}

const LAP_COLORS = ["#0f766e", "#d97706", "#2563eb", "#be3b3b", "#7c3aed"];
const EMPTY_LAPS: LapResult[] = [];
type LapAnalysisView = "insights" | "setup";

export function LapAnalysis({
  active = true,
  fileName,
  points,
  sensors,
  selectedPointIndex,
  onSelectedPointIndex,
  sourceVisibility,
  mapSettings,
  onMapSettingsChange,
  activeSegment,
  onActiveSegment,
  workspace,
}: LapAnalysisProps) {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<LapAnalysisView>("insights");
  const [importError, setImportError] = useState<string>();
  const [gateWidthDraft, setGateWidthDraft] = useState(workspace.gate?.widthMeters ?? 50);
  const [gateBearingDraft, setGateBearingDraft] = useState(workspace.gate?.forwardBearingDegrees ?? 0);
  const [selectedSectionId, setSelectedSectionId] = useState<string>();
  const laps = workspace.detection?.laps ?? EMPTY_LAPS;
  const selectedLaps = useMemo(
    () => workspace.selectedLapIds
      .map((id) => laps.find((lap) => lap.id === id))
      .filter((lap): lap is LapResult => Boolean(lap)),
    [laps, workspace.selectedLapIds],
  );
  const primaryLap = laps.find((lap) => lap.id === workspace.primaryLapId);
  const corners = useMemo(
    () => primaryLap && workspace.profile ? analyzeCorners(points, primaryLap, workspace.profile.sections) : [],
    [points, primaryLap, workspace.profile],
  );
  const completeLapCount = laps.filter((lap) => lap.completion === "complete").length;
  const insightsReady = Boolean(workspace.analysisLine && workspace.profile?.sections.length && laps.length);
  const bestSectorSeconds = useMemo(() => {
    const best = new Map<number, number>();
    for (const sector of workspace.sectors) {
      if (!sector.eligibleForBest) continue;
      const current = best.get(sector.sectorIndex);
      best.set(sector.sectorIndex, current === undefined ? sector.durationSeconds : Math.min(current, sector.durationSeconds));
    }
    return best;
  }, [workspace.sectors]);
  const usesAnalysisSectionPolicy = workspace.sectionResults.length > 0 || Boolean(workspace.analysisLine && workspace.profile?.sections.length);
  const partialPolicyResults = usesAnalysisSectionPolicy ? workspace.sectionResults : workspace.sectors;
  const partialCompletedSectorCount = partialPolicyResults.filter((sector) => sector.fromPartialLap).length;
  const partialEligibleSectorCount = partialPolicyResults.filter((sector) => sector.fromPartialLap && sector.eligibleForBest).length;
  const policyTheoreticalBestSeconds = usesAnalysisSectionPolicy
    ? workspace.automaticTheoreticalBestSeconds
    : workspace.theoreticalBestSeconds;
  const selectedSection = workspace.profile?.sections.find((section) => section.id === selectedSectionId)
    ?? workspace.profile?.sections[0];
  const selectedSectionVisuals = useMemo(() => selectedSection ? {
    [selectedSection.id]: { color: "#dc2626", width: 13, opacity: 1 },
  } : {}, [selectedSection]);
  const overlays: LapMapOverlay[] = useMemo(() => selectedLaps.map((lap, index) => ({
    id: lap.id,
    color: LAP_COLORS[index % LAP_COLORS.length],
    points: points.slice(lap.startIndex, lap.endIndex + 1),
  })), [points, selectedLaps]);
  const gates = useMemo(
    () => [workspace.gate, ...(workspace.profile?.sectorGates ?? [])].filter((gate): gate is NonNullable<typeof gate> => Boolean(gate)),
    [workspace.gate, workspace.profile?.sectorGates],
  );

  useEffect(() => {
    if (!workspace.gate) return;
    setGateWidthDraft(workspace.gate.widthMeters);
    setGateBearingDraft(workspace.gate.forwardBearingDegrees);
  }, [workspace.gate]);

  useEffect(() => {
    if (!workspace.profile?.sections.length) {
      setSelectedSectionId(undefined);
      return;
    }
    if (!workspace.profile.sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(workspace.profile.sections[0].id);
    }
  }, [selectedSectionId, workspace.profile]);

  async function importTrack(files: File[]) {
    const file = files[0];
    if (!file) return;
    const error = await workspace.importProfile(await file.text());
    setImportError(error);
  }

  async function saveAndExportProfile() {
    const profile = workspace.profile ?? await workspace.saveCurrentProfile();
    if (!profile) return;
    downloadText(`${safeBaseName(fileName)}.openvta-track.json`, exportTrackProfile(profile), "application/json");
  }

  function exportAllAnalysis() {
    downloadText(
      `${safeBaseName(fileName)}.lap-analysis.json`,
      lapAnalysisJson({
        sourceName: fileName,
        profile: workspace.profile,
        settings: { includePartialLapSectors: workspace.includePartialLapSectors },
        laps,
        sectors: workspace.sectors,
        corners,
        theoreticalBestSeconds: workspace.theoreticalBestSeconds,
        sectionResults: workspace.sectionResults,
        automaticTheoreticalBestSeconds: workspace.automaticTheoreticalBestSeconds,
      }),
      "application/json",
    );
  }

  function confirmGateReplacement(): boolean {
    return !workspace.gate || window.confirm(t("lap.confirmGateReplacement"));
  }

  function useSelectedPointAsStartFinish() {
    if (confirmGateReplacement()) workspace.useSelectedPointAsStartFinish(selectedPointIndex);
  }

  function applyGateChanges() {
    if (!workspace.gate || !confirmGateReplacement()) return;
    workspace.updateStartFinish(gateWidthDraft, gateBearingDraft);
  }

  return (
    <section className="lap-analysis-grid">
      <div className="lap-analysis-viewbar lap-wide-panel">
        <Tabs
          ariaLabel={t("lap.view.aria")}
          items={[
            { id: "insights", label: t("lap.workbench.title") },
            { id: "setup", label: t("lap.view.setup") },
          ]}
          value={activeView}
          onChange={(value) => setActiveView(value as LapAnalysisView)}
        />
        <div className="lap-analysis-context">
          <span>{workspace.profile?.name ?? t("lap.trackless")}</span>
          <StatusBadge tone={lookupTone(workspace.lookupState)}>{lookupLabel(workspace.lookupState, t)}</StatusBadge>
        </div>
      </div>

      {workspace.lookupMessage ? <p className="inline-warning lap-wide-panel">{workspace.lookupMessage}</p> : null}
      {workspace.detection?.warnings.length ? (
        <div className="lap-detection-warnings lap-wide-panel" role="status">
          {workspace.detection.warnings.map((warning) => (
            <p className="inline-warning" key={warning}>{localizeLapDetectionWarning(warning, t)}</p>
          ))}
        </div>
      ) : null}

      <div className="lap-analysis-view-content" hidden={activeView !== "insights"}>
        {insightsReady && workspace.profile && workspace.analysisLine ? (
          <SegmentAnalysisWorkbench
            active={active && activeView === "insights"}
            sourceName={fileName}
            points={points}
            sensors={sensors}
            laps={laps}
            profile={workspace.profile}
            analysisLine={workspace.analysisLine}
            includePartialLapSections={workspace.includePartialLapSectors}
            partialCompletedSectorCount={partialCompletedSectorCount}
            partialEligibleSectorCount={partialEligibleSectorCount}
            theoreticalBestSeconds={policyTheoreticalBestSeconds}
            onIncludePartialLapSections={workspace.setIncludePartialLapSectors}
            mapSettings={mapSettings}
            selectedPointIndex={selectedPointIndex}
            onSelectedPointIndex={onSelectedPointIndex}
            onMapSettingsChange={onMapSettingsChange}
            onActiveSegment={onActiveSegment}
            onSaveRange={(start, end, name, kind) => {
              workspace.saveRangeAsSection(start, end, name, kind);
            }}
            onOpenSetup={() => setActiveView("setup")}
          />
        ) : (
          <>
            <Panel
              title={t("lap.workbench.title")}
              eyebrow={t("lap.workbench.question")}
              className="lap-analysis-onboarding lap-wide-panel"
              actions={(
                <StatusBadge tone={!workspace.gate || completeLapCount ? "info" : "warning"}>
                  {!workspace.gate
                    ? t("lap.trackless")
                    : completeLapCount
                      ? t("lap.insights.sectionsPending")
                      : t("lap.noLaps")}
                </StatusBadge>
              )}
            >
              <p>{t("lap.view.noAnalysis")}</p>
              <div className="row-actions">
                <button type="button" className="button primary" onClick={useSelectedPointAsStartFinish}>
                  <Flag size={16} aria-hidden />{t("lap.useSelectedPoint")}
                </button>
                {workspace.canGenerateAutomaticSections ? (
                  <button type="button" className="button" onClick={() => workspace.recalculateAutomaticSections(Boolean(workspace.profile?.sections.length))}>
                    {t("lap.recalculateAutomatic")}
                  </button>
                ) : null}
                <button type="button" className="button" onClick={() => setActiveView("setup")}>{t("lap.view.openSetup")}</button>
              </div>
            </Panel>
            <Panel title={t("lap.routeAndGate")} className="lap-map-panel lap-wide-panel">
              <RouteMap
                points={points}
                selectedIndex={selectedPointIndex}
                sourceVisibility={sourceVisibility}
                settings={mapSettings}
                segment={activeSegment}
                trackCenterline={workspace.profile?.centerline}
                sectionCenterline={workspace.sectionCenterline}
                trackSections={workspace.profile?.sections}
                gates={gates}
                lapOverlays={overlays}
                onSelectedIndex={onSelectedPointIndex}
                onSegmentChange={onActiveSegment}
                onSettingsChange={onMapSettingsChange}
              />
              <PointTimeline points={points} selectedPointIndex={selectedPointIndex} onSelectedPointIndex={onSelectedPointIndex} />
            </Panel>
          </>
        )}
      </div>

      {activeView === "setup" ? (
        <>
          <Panel title={t("lap.title")} eyebrow={t("lap.subtitle")} className="lap-wide-panel">
            <div className="lap-setup-summary">
              <StatusBadge tone={lookupTone(workspace.lookupState)}>{workspace.profile?.name ?? t("lap.trackless")}</StatusBadge>
              <StatusBadge tone={workspace.profileOrigin === "local-override" ? "warning" : "info"}>{profileOriginLabel(workspace.profileOrigin, t)}</StatusBadge>
              {workspace.profile ? <span>{t("lap.profileAutosaved")}</span> : null}
              <span>{t("lap.selectedPoint")}: {selectedPointIndex + 1}</span>
              <span>{t("lap.detectedLaps")}: {completeLapCount}</span>
              <span>{t("lap.analysisSectorCount")}: {workspace.profile?.sections.length ?? 0}</span>
            </div>
            <div className="lap-track-toolbar">
              <FilePickerButton accept=".json,.openvta-track.json,application/json" onFiles={(files) => void importTrack(files)} icon={<Upload size={16} aria-hidden />}>{t("lap.importTrack")}</FilePickerButton>
              <button type="button" className="button" onClick={() => void saveAndExportProfile()}><Download size={16} aria-hidden />{t("lap.saveExportTrack")}</button>
              {workspace.profileOrigin === "built-in" || workspace.profileOrigin === "local-override" ? (
                <button type="button" className="button" disabled={workspace.profileOrigin === "built-in"} title={workspace.profileOrigin === "built-in" ? t("lap.workbench.builtInOriginalActive") : undefined} onClick={() => {
                  if (window.confirm(t("lap.confirmResetBuiltIn"))) void workspace.resetProfileOverride();
                }}>{t("lap.workbench.resetBuiltIn")}</button>
              ) : null}
              <button type="button" className="button primary" onClick={useSelectedPointAsStartFinish}><Flag size={16} aria-hidden />{t("lap.useSelectedPoint")}</button>
              <button type="button" className="button" onClick={() => workspace.addSectorGate(selectedPointIndex)} disabled={!workspace.gate}><MapPinned size={16} aria-hidden />{t("lap.addSectorGate")}</button>
            </div>
            {workspace.profileOrigin === "built-in" || workspace.profileOrigin === "local-override" ? <p className="lap-profile-edit-help">{t("lap.workbench.profileEditHelp")}</p> : null}
            <p className="lap-privacy-note">{t("lap.osmPrivacy")}</p>
            {importError ? <p className="inline-error" role="alert">{importError}</p> : null}
            {workspace.candidates.length > 1 && workspace.lookupState === "ambiguous" ? (
              <label className="field"><span>{t("lap.chooseCandidate")}</span><select defaultValue="" onChange={(event) => workspace.chooseCandidate(event.target.value)}><option value="" disabled>{t("lap.chooseCandidatePlaceholder")}</option>{workspace.candidates.map((candidate) => <option key={candidate.profile.id} value={candidate.profile.id}>{candidate.profile.name} · {candidate.medianDistanceMeters.toFixed(0)} m</option>)}</select></label>
            ) : null}
            {workspace.gate ? (
              <div className="form-grid lap-gate-form">
                <label className="field"><span>{t("lap.gateWidth")}</span><input type="number" min={10} max={200} value={gateWidthDraft} onChange={(event) => setGateWidthDraft(Number(event.target.value))} /></label>
                <label className="field"><span>{t("lap.forwardBearing")}</span><input type="number" min={0} max={359.9} step={0.1} value={gateBearingDraft} onChange={(event) => setGateBearingDraft(Number(event.target.value))} /></label>
                <button type="button" className="button" onClick={applyGateChanges}>{t("lap.applyGateChanges")}</button>
              </div>
            ) : <div className="empty-state">{t("lap.noGateHelp")}</div>}
            {workspace.profile?.source.kind === "osm" ? <p className="lap-attribution">{workspace.profile.source.attribution} · ODbL 1.0</p> : null}
          </Panel>

          <Panel title={t("lap.routeAndGate")} className="lap-map-panel lap-wide-panel">
            <RouteMap points={points} selectedIndex={selectedPointIndex} sourceVisibility={sourceVisibility} settings={mapSettings} segment={activeSegment} trackCenterline={workspace.profile?.centerline} sectionCenterline={workspace.sectionCenterline} trackSections={workspace.profile?.sections} sectionVisuals={selectedSectionVisuals} gates={gates} lapOverlays={overlays} onSectionSelect={setSelectedSectionId} onSelectedIndex={onSelectedPointIndex} onSegmentChange={onActiveSegment} onSettingsChange={onMapSettingsChange} />
            <PointTimeline points={points} selectedPointIndex={selectedPointIndex} onSelectedPointIndex={onSelectedPointIndex} />
          </Panel>

          <Panel title={t("lap.corrections")} className="lap-wide-panel">
        <div className="lap-track-toolbar">
          <button type="button" className="button" disabled={!workspace.gate} onClick={() => workspace.addBoundary(selectedPointIndex)}>
            <Scissors size={16} aria-hidden />
            {t("lap.splitAtPoint")}
          </button>
          <span>{t("lap.correctionHelp")}</span>
        </div>
        {workspace.detection?.boundaries.length ? (
          <div className="boundary-list">
            {workspace.detection.boundaries.map((boundary, index) => (
              <div key={boundary.id}>
                <span>{t("lap.boundary")} {index + 1} · {formatLapTime(boundary.elapsedSeconds)} · #{boundary.pointIndex + 1}</span>
                <button type="button" className="button ghost" aria-label={`${t("lap.boundary")} ${index + 1} · ${t("lap.mergeRemove")}`} onClick={() => workspace.removeBoundary(boundary.id)}>{t("lap.mergeRemove")}</button>
              </div>
            ))}
          </div>
        ) : null}
          </Panel>

          <Panel
        title={t("lap.sectors")}
        actions={(
          <label className="lap-option-check">
            <input type="checkbox" checked={workspace.includePartialLapSectors} onChange={(event) => workspace.setIncludePartialLapSectors(event.target.checked)} />
            <span>{t("lap.includePartialSectors")}</span>
          </label>
        )}
        className="lap-wide-panel"
      >
        <p className="lap-help">{t("lap.partialSectorHelp")}</p>
        <p className="partial-policy-impact" aria-live="polite">{partialCompletedSectorCount === 0
          ? t("lap.workbench.partialNoCandidates", { theoretical: policyTheoreticalBestSeconds === undefined ? t("lap.workbench.notAvailable") : formatLapTime(policyTheoreticalBestSeconds) })
          : t(workspace.includePartialLapSectors ? "lap.workbench.partialIncludedImpact" : "lap.workbench.partialExcludedImpact", {
              eligible: partialEligibleSectorCount,
              completed: partialCompletedSectorCount,
              theoretical: policyTheoreticalBestSeconds === undefined ? t("lap.workbench.notAvailable") : formatLapTime(policyTheoreticalBestSeconds),
            })}</p>
        {workspace.profile?.sectorGates.length ? (
          <div className="sector-gate-editor-list">
            <h3>{t("lap.sectorGates")}</h3>
            {workspace.profile.sectorGates.map((sectorGate, index, sectorGates) => (
              <SectorGateEditor
                key={sectorGate.id}
                gate={sectorGate}
                order={index}
                gateCount={sectorGates.length}
                onUpdate={(patch) => workspace.updateSectorGate(sectorGate.id, patch)}
                onMove={() => workspace.moveSectorGateToPoint(sectorGate.id, selectedPointIndex)}
                onReorder={(targetIndex) => workspace.reorderSectorGate(sectorGate.id, targetIndex)}
                onRemove={() => workspace.removeSectorGate(sectorGate.id)}
              />
            ))}
          </div>
        ) : null}
        {workspace.sectors.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t("lap.lap")}</th><th>{t("lap.sector")}</th><th>{t("lap.duration")}</th><th>{t("lap.deltaBest")}</th><th>{t("lap.partial")}</th><th>{t("lap.bestEligible")}</th></tr></thead>
              <tbody>{workspace.sectors.map((sector) => (
                <tr key={sector.id}>
                  <td>{lapLabel(laps.find((lap) => lap.id === sector.lapId), t)}</td>
                  <td>{sector.name}</td>
                  <td>{formatLapTime(sector.durationSeconds)}</td>
                  <td>{bestSectorSeconds.get(sector.sectorIndex) === undefined ? "—" : formatDelta(sector.durationSeconds - bestSectorSeconds.get(sector.sectorIndex)!)}</td>
                  <td>{sector.fromPartialLap ? t("lap.yes") : t("lap.no")}</td>
                  <td>{sector.eligibleForBest ? t("lap.yes") : t("lap.no")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty-state">{t("lap.noSectors")}</div>}
          </Panel>

          <Panel
        title={t("lap.sections")}
        actions={(
          <button
            type="button"
            className="button"
            disabled={!workspace.canGenerateAutomaticSections}
            onClick={() => {
              const hasSections = Boolean(workspace.profile?.sections.length);
              if (!hasSections || window.confirm(t("lap.confirmReplaceAutomatic"))) {
                workspace.recalculateAutomaticSections(hasSections);
              }
            }}
          >
            {t("lap.recalculateAutomatic")}
          </button>
        )}
        className="lap-wide-panel"
      >
        {workspace.profile?.sections.length && selectedSection ? (
          <div className="section-editor-list">
            <div className="section-editor-navigation">
              <label className="field">
                <span>{t("lap.selectedSection")}</span>
                <select value={selectedSection.id} onChange={(event) => setSelectedSectionId(event.target.value)}>
                  {workspace.profile.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                </select>
              </label>
              <span>{t("lap.sectionPosition", { current: workspace.profile.sections.indexOf(selectedSection) + 1, total: workspace.profile.sections.length })}</span>
            </div>
            <SectionEditor
              section={selectedSection}
              onUpdate={(patch) => workspace.updateSection(selectedSection.id, patch)}
              onRemove={() => {
                if (window.confirm(t("lap.confirmRemoveSection", { name: selectedSection.name }))) workspace.removeSection(selectedSection.id);
              }}
            />
          </div>
        ) : <div className="empty-state">{t("lap.noSections")}</div>}
          </Panel>

          <Panel title={t("lap.corners")} className="lap-wide-panel">
        {corners.length ? (
          <div className="table-wrap">
            <table><thead><tr><th>{t("lap.section")}</th><th>{t("lap.duration")}</th><th>{t("lap.entrySpeed")}</th><th>{t("lap.minimumSpeed")}</th><th>{t("lap.exitSpeed")}</th><th>{t("lap.maxLateralG")}</th><th>{t("lap.maxDecelerationG")}</th></tr></thead>
              <tbody>{corners.map((corner) => <tr key={corner.sectionId}><td>{corner.name}</td><td>{formatLapTime(corner.durationSeconds)}</td><td>{corner.entrySpeedKmh.toFixed(1)} km/h</td><td>{corner.minimumSpeedKmh.toFixed(1)} km/h</td><td>{corner.exitSpeedKmh.toFixed(1)} km/h</td><td>{corner.maxLateralG === undefined ? "—" : `${corner.maxLateralG.toFixed(2)} g`}</td><td>{corner.maxDecelerationG === undefined ? "—" : `${corner.maxDecelerationG.toFixed(2)} g`}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <div className="empty-state">{t("lap.noCornerMetrics")}</div>}
          </Panel>

          <Panel title={t("lap.exports")} className="lap-wide-panel">
        <div className="lap-track-toolbar">
          <button type="button" className="button" onClick={() => downloadText(`${safeBaseName(fileName)}.laps.csv`, lapResultsCsv(laps), "text/csv")}>{t("lap.exportLaps")}</button>
          <button type="button" className="button" onClick={() => downloadText(`${safeBaseName(fileName)}.sectors.csv`, sectorResultsCsv(workspace.sectors), "text/csv")}>{t("lap.exportSectors")}</button>
          <button type="button" className="button" onClick={() => downloadText(`${safeBaseName(fileName)}.corners.csv`, cornerResultsCsv(corners), "text/csv")}>{t("lap.exportCorners")}</button>
          <button type="button" className="button" onClick={() => downloadText(`${safeBaseName(fileName)}.analysis-sectors.csv`, sectionResultsCsv(workspace.sectionResults), "text/csv")}>{t("lap.exportAnalysisSectors")}</button>
          <button type="button" className="button primary" onClick={exportAllAnalysis}><Download size={16} aria-hidden />{t("lap.exportAnalysis")}</button>
        </div>
          </Panel>
        </>
      ) : null}
    </section>
  );
}

function SectorGateEditor({
  gate,
  order,
  gateCount,
  onUpdate,
  onMove,
  onReorder,
  onRemove,
}: {
  gate: TrackGate;
  order: number;
  gateCount: number;
  onUpdate: (patch: Partial<Pick<TrackGate, "name" | "widthMeters" | "forwardBearingDegrees">>) => void;
  onMove: () => void;
  onReorder: (targetIndex: number) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const gateLabel = gate.name || `${t("lap.sector")} ${order + 1}`;
  return (
    <div className="sector-gate-editor-row">
      <label className="field"><span>{t("lap.name")}</span><input aria-label={`${gateLabel} ${t("lap.name")}`} defaultValue={gate.name} onBlur={(event) => onUpdate({ name: event.target.value })} /></label>
      <label className="field"><span>{t("lap.order")}</span><select aria-label={`${gateLabel} ${t("lap.order")}`} value={order} onChange={(event) => onReorder(Number(event.target.value))}>{Array.from({ length: gateCount }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></label>
      <label className="field"><span>{t("lap.gateWidth")}</span><input aria-label={`${gateLabel} ${t("lap.gateWidth")}`} type="number" min={10} max={200} value={gate.widthMeters} onChange={(event) => onUpdate({ widthMeters: Number(event.target.value) })} /></label>
      <label className="field"><span>{t("lap.forwardBearing")}</span><input aria-label={`${gateLabel} ${t("lap.forwardBearing")}`} type="number" min={0} max={359.9} step={0.1} value={gate.forwardBearingDegrees} onChange={(event) => onUpdate({ forwardBearingDegrees: Number(event.target.value) })} /></label>
      <button type="button" className="button" aria-label={`${gateLabel} ${t("lap.moveHere")}`} onClick={onMove}>{t("lap.moveHere")}</button>
      <button type="button" className="button ghost" aria-label={`${gateLabel} ${t("lap.remove")}`} onClick={onRemove}>{t("lap.remove")}</button>
    </div>
  );
}

function SectionEditor({ section, onUpdate, onRemove }: { section: TrackSection; onUpdate: (patch: Partial<TrackSection>) => void; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="section-editor-row">
      <legend>{section.name}</legend>
      <label className="field"><span>{t("lap.name")}</span><input aria-label={`${section.name} ${t("lap.name")}`} value={section.name} onChange={(event) => onUpdate({ name: event.target.value })} /></label>
      <label className="field"><span>{t("lap.kind")}</span><select aria-label={`${section.name} ${t("lap.kind")}`} value={section.kind} onChange={(event) => onUpdate({ kind: event.target.value as TrackSection["kind"] })}><option value="corner-left">{t("lap.cornerLeft")}</option><option value="corner-right">{t("lap.cornerRight")}</option><option value="straight">{t("lap.straight")}</option></select></label>
      <label className="field"><span>{t("lap.startMeters")}</span><input aria-label={`${section.name} ${t("lap.startMeters")}`} type="number" min={0} value={section.startDistanceMeters} onChange={(event) => onUpdate({ startDistanceMeters: Number(event.target.value) })} /></label>
      <label className="field"><span>{t("lap.endMeters")}</span><input aria-label={`${section.name} ${t("lap.endMeters")}`} type="number" min={0} value={section.endDistanceMeters} onChange={(event) => onUpdate({ endDistanceMeters: Number(event.target.value) })} /></label>
      <button type="button" className="button ghost" aria-label={`${section.name} ${t("lap.remove")}`} onClick={onRemove}>{t("lap.remove")}</button>
    </fieldset>
  );
}

function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(3).padStart(6, "0")}`;
}

function formatDelta(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const normalized = Math.abs(seconds) < 0.0005 ? 0 : seconds;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(3)} s`;
}

function lapLabel(lap: LapResult | undefined, t: Translate): string {
  if (!lap) return "—";
  if (lap.completion === "partial-start") return t("lap.partialStart");
  if (lap.completion === "partial-end") return t("lap.partialEnd");
  if (lap.completion === "partial-both") return t("lap.partialBoth");
  return `${t("lap.lap")} ${lap.ordinal}`;
}

function localizeLapDetectionWarning(warning: string, t: Translate): string {
  const keys: Record<string, TranslationKey> = {
    "The start/finish gate was not crossed in the forward direction.": "lap.warning.noForwardCrossing",
    "One or more laps contain a GPS time gap.": "lap.warning.gpsGap",
    "One or more laps crossed the start/finish gate in the reverse direction.": "lap.warning.reverseCrossing",
    "One or more laps crossed timing sector gates in the wrong order.": "lap.warning.missedSector",
  };
  const key = keys[warning];
  return key ? t(key) : warning;
}

function lookupLabel(state: LapWorkspace["lookupState"], t: Translate): string {
  const keys: Record<LapWorkspace["lookupState"], TranslationKey> = {
    idle: "lap.lookup.idle",
    cache: "lap.lookup.cache",
    searching: "lap.lookup.searching",
    matched: "lap.lookup.matched",
    ambiguous: "lap.lookup.ambiguous",
    "no-match": "lap.lookup.noMatch",
    offline: "lap.lookup.offline",
    "invalid-route": "lap.lookup.invalidRoute",
    imported: "lap.lookup.imported",
    manual: "lap.lookup.manual",
    generated: "lap.lookup.generated",
  };
  return t(keys[state]);
}

function profileOriginLabel(origin: LapWorkspace["profileOrigin"], t: Translate): string {
  const keys = {
    "built-in": "lap.profileOrigin.builtIn",
    "local-override": "lap.profileOrigin.localOverride",
    imported: "lap.profileOrigin.imported",
    osm: "lap.profileOrigin.osm",
    generated: "lap.profileOrigin.generated",
  } as const;
  return origin ? t(keys[origin]) : t("lap.profileOrigin.none");
}

function lookupTone(state: LapWorkspace["lookupState"]): "neutral" | "success" | "warning" | "danger" | "info" {
  if (state === "matched" || state === "imported" || state === "manual" || state === "generated") return "success";
  if (state === "offline" || state === "no-match" || state === "invalid-route") return "warning";
  if (state === "searching" || state === "cache") return "info";
  return "neutral";
}

function safeBaseName(name: string): string {
  return name.replace(/\.vta$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "openvta";
}
