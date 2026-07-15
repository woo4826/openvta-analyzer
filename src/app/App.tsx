import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, Gauge, HelpCircle, Map as MapIcon, Settings, TestTube2 } from "lucide-react";
import { sampleCalibrationName, sampleCalibrationText, sampleVtaName, sampleVtaText } from "./sampleData";
import { buildTourSteps, nextAvailableTourStepIndex } from "./tourSteps";
import { lapWorkspaceKey, selectLapGpsSource, type LapGpsSourceKey } from "./lapGpsSource";
import { useLapWorkspace } from "./useLapWorkspace";
import { isFilterTransformReady, normalizeTransformMode } from "./workspaceCapabilities";
import { displayGpsPointsWithSources } from "../domain/analysis";
import { applyCalibration, estimateCalibrationOffsets } from "../domain/calibration";
import { defaultFilterSettings, applyAccelerationFilter } from "../domain/filtering";
import { parseVtaText } from "../domain/parser";
import { summarizeVta } from "../domain/statistics";
import { loadTextFilesFromInput } from "../domain/zip";
import {
  completedOnboardingTourState,
  loadOnboardingTourState,
  saveOnboardingTourState,
  skippedOnboardingTourState,
} from "../domain/settings";
import type { LineEnding } from "../domain/export";
import type {
  ActiveSegment,
  AxisAlignedRegion,
  CalibrationOffsets,
  FilterSettings,
  MapSettings,
  SensorPoint,
  SourceVisibility,
  TransformMode,
  VtaFile,
  VtaWorkspaceFile,
} from "../domain/types";
import { FileDrop } from "../components/FileDrop";
import { TopbarFileWorkspace } from "../components/TopbarFileWorkspace";
import { Overview } from "../components/Overview";
import { LapAnalysis } from "../components/LapAnalysis";
import { Charts, type AccelerationSensorSet } from "../components/Charts";
import { Tables } from "../components/Tables";
import { CalibrationPanel } from "../components/CalibrationPanel";
import { ExportPanel } from "../components/ExportPanel";
import { GuidedTour } from "../components/GuidedTour";
import { WorkspaceStatus } from "../components/WorkspaceStatus";
import { TrackLibrary } from "../components/TrackLibrary";
import { FilePickerButton, Tabs } from "../components/ui";
import { formatLocalizedMessage, type LocalizedMessage } from "../i18n/messages";
import { useI18n } from "../i18n/useI18n";
import type { LanguageCode, TranslationKey } from "../i18n/locales";

type TabKey = "overview" | "laps" | "charts" | "tables" | "calibration" | "export";

const tabs: Array<{ key: TabKey; labelKey: TranslationKey }> = [
  { key: "overview", labelKey: "app.tab.overview" },
  { key: "laps", labelKey: "app.tab.laps" },
  { key: "charts", labelKey: "app.tab.charts" },
  { key: "tables", labelKey: "app.tab.tables" },
  { key: "calibration", labelKey: "app.tab.calibration" },
  { key: "export", labelKey: "app.tab.export" },
];

const defaultSourceVisibility: SourceVisibility = { rawGps: true, enhancedGps: true };
const emptySensors: SensorPoint[] = [];
const defaultMapSettings: MapSettings = {
  pointSize: 6,
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  speedThresholds: [10, 30, 50, 80],
};

export function App() {
  const { language, languages, setLanguage, t } = useI18n();
  const [files, setFiles] = useState<VtaWorkspaceFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedPointIndex, setSelectedPointIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [calibration, setCalibration] = useState<CalibrationOffsets | undefined>();
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(defaultFilterSettings);
  const [sourceVisibility, setSourceVisibility] = useState<SourceVisibility>(defaultSourceVisibility);
  const [lapSourcePreferences, setLapSourcePreferences] = useState<Record<string, LapGpsSourceKey>>({});
  const [mapSettings, setMapSettings] = useState<MapSettings>(defaultMapSettings);
  const [activeSegment, setActiveSegment] = useState<ActiveSegment | undefined>();
  const [region, setRegion] = useState<AxisAlignedRegion | undefined>();
  const [transformMode, setTransformMode] = useState<TransformMode>("raw");
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [loadError, setLoadError] = useState<LocalizedMessage | undefined>();
  const [initialTourState] = useState(() => loadOnboardingTourState());
  const [tourActive, setTourActive] = useState(() => initialTourState.status === "new");
  const [tourIndex, setTourIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trackLibraryOpen, setTrackLibraryOpen] = useState(false);
  const previousEffectiveSourceVisibility = useRef<SourceVisibility | undefined>();

  const activeFile = files[activeIndex];
  const normalizedSourceVisibility = useMemo(
    () => (activeFile ? normalizeSourceVisibility(activeFile, sourceVisibility) : sourceVisibility),
    [activeFile, sourceVisibility],
  );
  const lapGpsSource = useMemo(() => {
    if (!activeFile) return undefined;
    const preferred = lapSourcePreferences[activeFile.id];
    const requested = preferred
      ? { rawGps: preferred === "rawGps", enhancedGps: preferred === "enhancedGps" }
      : normalizedSourceVisibility;
    return selectLapGpsSource(activeFile, requested);
  }, [activeFile, lapSourcePreferences, normalizedSourceVisibility]);
  const effectiveSourceVisibility = activeTab === "laps" && lapGpsSource
    ? lapGpsSource.visibility
    : normalizedSourceVisibility;
  const visibleGpsPoints = useMemo(
    () => activeTab === "laps" && lapGpsSource
      ? lapGpsSource.points
      : activeFile
        ? displayGpsPointsWithSources(activeFile, effectiveSourceVisibility)
        : [],
    [activeFile, activeTab, effectiveSourceVisibility, lapGpsSource],
  );
  const lapWorkspace = useLapWorkspace(
    lapWorkspaceKey(activeFile?.id, lapGpsSource?.key),
    activeFile?.sourceName,
    lapGpsSource?.points ?? [],
  );
  const calibratedSensors = useMemo(
    () => applyCalibration(activeFile?.sensorPoints ?? [], calibration),
    [activeFile, calibration],
  );
  const filterResult = useMemo(
    () => applyAccelerationFilter(calibratedSensors, filterSettings),
    [calibratedSensors, filterSettings],
  );
  const transformedSensors = filterResult.sensors;
  const rawSensors = activeFile?.sensorPoints ?? emptySensors;
  const filterTransformReady = isFilterTransformReady(filterSettings.enabled, calibratedSensors, transformedSensors);
  const chartSensors = useMemo(
    () => sensorsForTransformMode(transformMode, rawSensors, calibratedSensors, transformedSensors),
    [calibratedSensors, rawSensors, transformedSensors, transformMode],
  );
  const chartAccelerationSensorSets = useMemo(
    () =>
      transformMode === "compare"
        ? accelerationSensorSets(rawSensors, calibratedSensors, transformedSensors)
        : undefined,
    [calibratedSensors, rawSensors, transformedSensors, transformMode],
  );
  const exportSensors = useMemo(
    () => sensorsForTransformMode(transformMode, rawSensors, calibratedSensors, transformedSensors),
    [calibratedSensors, rawSensors, transformedSensors, transformMode],
  );
  const tableSensors = useMemo(
    () => sensorsForTransformMode(transformMode, rawSensors, calibratedSensors, transformedSensors),
    [calibratedSensors, rawSensors, transformedSensors, transformMode],
  );
  const stats = useMemo(() => (activeFile ? summarizeVta(activeFile) : undefined), [activeFile]);
  const tourSteps = useMemo(() => buildTourSteps(Boolean(activeFile)), [activeFile]);

  useEffect(() => {
    setTransformMode((mode) => normalizeTransformMode(
      mode,
      Boolean(calibration) && rawSensors.length > 0,
      rawSensors.length > 0 && filterTransformReady,
    ));
  }, [calibration, filterTransformReady, rawSensors.length]);

  useEffect(() => {
    if (!activeFile) {
      previousEffectiveSourceVisibility.current = undefined;
      setRegion(undefined);
      return;
    }
    const previous = previousEffectiveSourceVisibility.current;
    previousEffectiveSourceVisibility.current = effectiveSourceVisibility;
    if (previous && !isSameSourceVisibility(previous, effectiveSourceVisibility)) {
      setSelectedPointIndex(0);
      setActiveSegment(undefined);
      setRegion(undefined);
    }
  }, [activeFile, effectiveSourceVisibility]);

  useEffect(() => {
    setSelectedPointIndex((index) => clampSelectedPointIndex(index, visibleGpsPoints.length));
  }, [visibleGpsPoints.length]);

  async function loadFiles(inputFiles: File[]) {
    setLoadError(undefined);
    try {
      const loaded = (await Promise.all(inputFiles.map(loadTextFilesFromInput))).flat();
      if (!loaded.length) {
        setLoadError({ key: "app.loadError.noVtaFiles" });
        return;
      }
      const parsed = loaded.map((file, index) => toWorkspaceFile(parseVtaText(file.name, file.text), index));
      setFiles(parsed);
      setActiveIndex(0);
      setSelectedPointIndex(0);
      setActiveTab("overview");
      setCalibration(undefined);
      setFilterSettings(defaultFilterSettings);
      setSourceVisibility(defaultSourceVisibility);
      setLapSourcePreferences({});
      setActiveSegment(undefined);
      setRegion(undefined);
      setTransformMode("raw");
      setLineEnding("lf");
    } catch {
      setLoadError({ key: "app.loadError.unable" });
    }
  }

  function loadSample() {
    setFiles([toWorkspaceFile(parseVtaText(sampleVtaName, sampleVtaText), 0)]);
    setActiveIndex(0);
    setSelectedPointIndex(0);
    setActiveTab("overview");
    setCalibration(undefined);
    setFilterSettings(defaultFilterSettings);
    setSourceVisibility(defaultSourceVisibility);
    setLapSourcePreferences({});
    setActiveSegment(undefined);
    setRegion(undefined);
    setTransformMode("raw");
    setLineEnding("lf");
    setLoadError(undefined);
  }

  function loadSampleCalibration() {
    const calibrationFile = parseVtaText(sampleCalibrationName, sampleCalibrationText);
    setCalibration(estimateCalibrationOffsets(calibrationFile.sensorPoints, {}, calibrationFile.sourceName));
    setActiveTab("calibration");
  }

  async function loadCalibrationFile(file: File) {
    const parsed = parseVtaText(file.name, await file.text());
    setCalibration(estimateCalibrationOffsets(parsed.sensorPoints, {}, parsed.sourceName));
  }

  function selectFile(fileId: string) {
    const nextIndex = files.findIndex((file) => file.id === fileId);
    if (nextIndex === -1) {
      return;
    }
    setActiveIndex(nextIndex);
    setSelectedPointIndex(0);
    setActiveSegment(undefined);
    setRegion(undefined);
  }

  function removeFile(fileId: string) {
    const removedIndex = files.findIndex((file) => file.id === fileId);
    if (removedIndex === -1) {
      return;
    }
    const nextFiles = files.filter((file) => file.id !== fileId);
    setFiles(nextFiles);
    setSelectedPointIndex(0);
    setActiveSegment(undefined);
    setRegion(undefined);
    if (!nextFiles.length) {
      setActiveIndex(0);
      setActiveTab("overview");
      return;
    }
    if (removedIndex === activeIndex) {
      setActiveIndex(Math.min(removedIndex, nextFiles.length - 1));
      return;
    }
    if (removedIndex < activeIndex) {
      setActiveIndex(activeIndex - 1);
    }
  }

  function updateSourceVisibility(nextVisibility: SourceVisibility) {
    if (activeTab === "laps" && activeFile) {
      const selected = selectLapGpsSource(activeFile, nextVisibility);
      if (selected.key) {
        setLapSourcePreferences((previous) => ({ ...previous, [activeFile.id]: selected.key! }));
      }
      setSelectedPointIndex(0);
      setActiveSegment(undefined);
      setRegion(undefined);
      return;
    }
    setSourceVisibility(nextVisibility);
    setSelectedPointIndex(0);
    setActiveSegment(undefined);
    setRegion(undefined);
  }

  function setTourStep(index: number) {
    const nextIndex = nextAvailableTourStepIndex(tourSteps, index, Boolean(activeFile));
    const nextStep = tourSteps[nextIndex];
    if (nextStep?.requiredTab) {
      setActiveTab(nextStep.requiredTab);
    }
    setTourIndex(nextIndex);
  }

  function skipTour() {
    const nextState = skippedOnboardingTourState();
    saveOnboardingTourState(nextState);
    setTourActive(false);
  }

  function completeTour() {
    const nextState = completedOnboardingTourState();
    saveOnboardingTourState(nextState);
    setTourActive(false);
  }

  function restartTour() {
    setSettingsOpen(false);
    setTourIndex(0);
    setTourActive(true);
  }

  function loadSampleForTour() {
    loadSample();
    setTourIndex(2);
  }

  return (
    <div className="app-shell">
      <header className="topbar" aria-hidden={tourActive ? true : undefined}>
        <div className="brand">
          <strong>OpenVTA Analyzer</strong>
          <span>{t("app.brand.subtitle")}</span>
        </div>
        <div className="topbar-actions" data-tour="topbar-file-actions">
          <label className="language-selector">
            <span>{t("language.selector.label")}</span>
            <select
              aria-label={t("language.selector.label")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
            >
              {Object.values(languages).map((option) => (
                <option value={option.code} key={option.code}>
                  {option.nativeName}
                </option>
              ))}
            </select>
          </label>
          <TopbarFileWorkspace
            files={files}
            activeFileId={activeFile?.id}
            onFiles={(incoming) => void loadFiles(incoming)}
            onSelectFile={selectFile}
            onRemoveFile={removeFile}
          />
          <FilePickerButton
            accept=".vta,.Vta,.zip"
            multiple
            onFiles={(incoming) => void loadFiles(incoming)}
            variant="ghost"
            icon={<FileUp size={16} aria-hidden />}
          >
            {t("app.openFile")}
          </FilePickerButton>
          <button type="button" className="button ghost" onClick={loadSample}>
            <TestTube2 size={16} aria-hidden />
            {t("app.loadSample")}
          </button>
          <button type="button" className="button ghost" onClick={loadSampleCalibration} disabled={!activeFile}>
            <Settings size={16} aria-hidden />
            {t("app.sampleCalibration")}
          </button>
          <button type="button" className="button ghost" onClick={() => setTrackLibraryOpen(true)}>
            <MapIcon size={16} aria-hidden />
            {t("trackLibrary.menu")}
          </button>
          <div className="settings-menu-wrap">
            <button
              type="button"
              className="button ghost"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings size={16} aria-hidden />
              {t("settings.menu")}
            </button>
            {settingsOpen ? (
              <div className="settings-popover" role="menu">
                <button type="button" className="button ghost" role="menuitem" onClick={restartTour}>
                  <HelpCircle size={16} aria-hidden />
                  {t("settings.restartGuide")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className={`workspace${activeTab === "laps" ? " is-lap-analysis" : ""}`} aria-hidden={tourActive ? true : undefined}>
        <div className="privacy-note" data-tour="privacy-note">
          {t("app.privacyNote")}
        </div>

        {!activeFile ? (
          <FileDrop
            onFiles={(incoming) => void loadFiles(incoming)}
            loadError={loadError ? formatLocalizedMessage(loadError, t) : undefined}
            onSample={loadSample}
          />
        ) : (
          <div className={`workspace-grid${activeTab === "laps" ? " workspace-grid-laps" : ""}`}>
            <section className="analysis-main">
              <div data-tour="analysis-tabs">
                <Tabs
                  ariaLabel={t("app.sectionsAria")}
                  items={tabs.map((tab) => ({ id: tab.key, label: t(tab.labelKey) }))}
                  value={activeTab}
                  onChange={(value) => setActiveTab(value as TabKey)}
                  getTabId={analysisTabId}
                  getPanelId={analysisPanelId}
                />
              </div>

              {tabs.map((tab) => (
                <div
                  key={tab.key}
                  role="tabpanel"
                  id={analysisPanelId(tab.key)}
                  aria-labelledby={analysisTabId(tab.key)}
                  hidden={activeTab !== tab.key}
                  tabIndex={0}
                >
                  {tab.key === "overview" && activeTab === "overview" && stats ? (
                    <Overview
                      file={activeFile}
                      stats={stats}
                      selectedPointIndex={selectedPointIndex}
                      onSelectedPointIndex={setSelectedPointIndex}
                      sourceVisibility={effectiveSourceVisibility}
                      mapSettings={mapSettings}
                      activeSegment={activeSegment}
                      region={region}
                      onSegmentChange={setActiveSegment}
                      onRegionChange={setRegion}
                      onMapSettingsChange={setMapSettings}
                      visiblePoints={visibleGpsPoints}
                      filterWarning={filterResult.warning}
                    />
                  ) : null}

                  {tab.key === "charts" && activeTab === "charts" ? (
                    <Charts
                      file={activeFile}
                      sensors={chartSensors}
                      accelerationSensorSets={chartAccelerationSensorSets}
                      selectedPointIndex={selectedPointIndex}
                      onSelectedPointIndex={setSelectedPointIndex}
                      activeSegment={activeSegment}
                      onActiveSegment={setActiveSegment}
                      transformMode={transformMode}
                      visiblePoints={visibleGpsPoints}
                    />
                  ) : null}

                  {tab.key === "laps" ? (
                    <LapAnalysis
                      active={activeTab === "laps"}
                      recordingId={activeFile.id}
                      fileName={activeFile.sourceName}
                      points={lapGpsSource?.points ?? []}
                      sensors={chartSensors}
                      selectedPointIndex={selectedPointIndex}
                      onSelectedPointIndex={setSelectedPointIndex}
                      sourceVisibility={lapGpsSource?.visibility ?? effectiveSourceVisibility}
                      mapSettings={mapSettings}
                      onMapSettingsChange={setMapSettings}
                      activeSegment={activeSegment}
                      onActiveSegment={setActiveSegment}
                      workspace={lapWorkspace}
                    />
                  ) : null}

                  {tab.key === "tables" && activeTab === "tables" ? (
                    <Tables
                      file={activeFile}
                      sensors={tableSensors}
                      visiblePoints={visibleGpsPoints}
                      activeSegment={activeSegment}
                    />
                  ) : null}

                  {tab.key === "calibration" && activeTab === "calibration" ? (
                    <CalibrationPanel
                      file={activeFile}
                      sensors={activeFile.sensorPoints}
                      transformedSensors={transformedSensors}
                      calibration={calibration}
                      onCalibration={setCalibration}
                      onCalibrationFile={(file) => void loadCalibrationFile(file)}
                      filterSettings={filterSettings}
                      onFilterSettings={setFilterSettings}
                      filterWarning={filterResult.warning}
                      sampleRateHz={filterResult.sampleRateHz}
                      transformMode={transformMode}
                      onTransformMode={setTransformMode}
                    />
                  ) : null}

                  {tab.key === "export" && activeTab === "export" && stats ? (
                    <ExportPanel
                      file={activeFile}
                      sensors={exportSensors}
                      stats={stats}
                      visiblePoints={visibleGpsPoints}
                      activeSegment={activeSegment}
                      onActiveSegment={setActiveSegment}
                      lineEnding={lineEnding}
                      onLineEnding={setLineEnding}
                      transformMode={transformMode}
                      calibration={calibration}
                      filterSettings={filterSettings}
                    />
                  ) : null}
                </div>
              ))}
            </section>

            {activeTab !== "laps" ? (
              <aside className="analysis-inspector">
                <div data-tour="workspace-status">
                  <WorkspaceStatus
                    sourceVisibility={effectiveSourceVisibility}
                    onSourceVisibility={updateSourceVisibility}
                    rawGpsCount={activeFile.gpsPoints.length}
                    enhancedGpsCount={activeFile.enhancedPoints.length}
                    sensorCount={activeFile.sensorPoints.length}
                    transformMode={transformMode}
                    onTransformMode={setTransformMode}
                    calibrationReady={Boolean(calibration)}
                    filterReady={filterTransformReady}
                    onOpenCalibration={() => setActiveTab("calibration")}
                    activeSegment={activeSegment}
                    visiblePointCount={visibleGpsPoints.length}
                    onActiveSegment={setActiveSegment}
                  />
                </div>
              </aside>
            ) : null}
          </div>
        )}

        <footer className="privacy-note">
          <Gauge size={15} aria-hidden /> {t("app.footerNote")} <Download size={15} aria-hidden />
        </footer>
      </main>
      <TrackLibrary
        open={trackLibraryOpen}
        activeFileName={activeFile?.sourceName}
        onClose={() => setTrackLibraryOpen(false)}
        onApply={lapWorkspace.applyProfile}
      />
      {tourActive ? (
        <GuidedTour
          steps={tourSteps}
          activeIndex={tourIndex}
          onIndexChange={setTourStep}
          onSkip={skipTour}
          onDone={completeTour}
          onLoadSample={loadSampleForTour}
        />
      ) : null}
    </div>
  );
}

function toWorkspaceFile(file: VtaFile, index: number): VtaWorkspaceFile {
  const loadedAt = Date.now();
  return {
    ...file,
    id: `${file.sourceName}-${loadedAt}-${index}`,
    loadedAt,
  };
}

function normalizeSourceVisibility(file: VtaFile, visibility: SourceVisibility): SourceVisibility {
  const hasRawGps = file.gpsPoints.length > 0;
  const hasEnhancedGps = file.enhancedPoints.length > 0;
  const normalized = {
    rawGps: hasRawGps && visibility.rawGps,
    enhancedGps: hasEnhancedGps && visibility.enhancedGps,
  };

  if (normalized.rawGps || normalized.enhancedGps) {
    return normalized;
  }

  return {
    rawGps: hasRawGps,
    enhancedGps: hasEnhancedGps,
  };
}

function isSameSourceVisibility(left: SourceVisibility, right: SourceVisibility): boolean {
  return left.rawGps === right.rawGps && left.enhancedGps === right.enhancedGps;
}

function clampSelectedPointIndex(index: number, pointCount: number): number {
  if (pointCount <= 0) {
    return 0;
  }
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(pointCount - 1, Math.max(0, safeIndex));
}

function sensorsForTransformMode(
  mode: TransformMode,
  rawSensors: SensorPoint[],
  calibratedSensors: SensorPoint[],
  filteredSensors: SensorPoint[],
): SensorPoint[] {
  if (mode === "raw") {
    return rawSensors;
  }
  if (mode === "calibrated") {
    return calibratedSensors;
  }
  return filteredSensors;
}

function analysisTabId(tab: string): string {
  return `analysis-tab-${tab}`;
}

function analysisPanelId(tab: string): string {
  return `analysis-panel-${tab}`;
}

function accelerationSensorSets(
  rawSensors: SensorPoint[],
  calibratedSensors: SensorPoint[],
  filteredSensors: SensorPoint[],
): AccelerationSensorSet[] {
  return [
    { label: "Raw", sensors: rawSensors },
    { label: "Calibrated", sensors: calibratedSensors },
    { label: "Filtered", sensors: filteredSensors },
  ];
}
