import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, Gauge, Settings, TestTube2 } from "lucide-react";
import { sampleCalibrationName, sampleCalibrationText, sampleVtaName, sampleVtaText } from "./sampleData";
import { displayGpsPointsWithSources } from "../domain/analysis";
import { applyCalibration, estimateCalibrationOffsets } from "../domain/calibration";
import { defaultFilterSettings, applyAccelerationFilter } from "../domain/filtering";
import { parseVtaText } from "../domain/parser";
import { summarizeVta } from "../domain/statistics";
import { loadTextFilesFromInput } from "../domain/zip";
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
import { FileTray } from "../components/FileTray";
import { Overview } from "../components/Overview";
import { Charts, type AccelerationSensorSet } from "../components/Charts";
import { Tables } from "../components/Tables";
import { CalibrationPanel } from "../components/CalibrationPanel";
import { ExportPanel } from "../components/ExportPanel";
import { WorkspaceStatus } from "../components/WorkspaceStatus";

type TabKey = "overview" | "charts" | "tables" | "calibration" | "export";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "charts", label: "Charts" },
  { key: "tables", label: "Tables" },
  { key: "calibration", label: "Calibration" },
  { key: "export", label: "Export" },
];

const defaultSourceVisibility: SourceVisibility = { rawGps: true, enhancedGps: true };
const emptySensors: SensorPoint[] = [];
const defaultMapSettings: MapSettings = {
  pointSize: 6,
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  speedThresholds: [10, 30, 50, 80],
};

export function App() {
  const [files, setFiles] = useState<VtaWorkspaceFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedPointIndex, setSelectedPointIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [calibration, setCalibration] = useState<CalibrationOffsets | undefined>();
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(defaultFilterSettings);
  const [sourceVisibility, setSourceVisibility] = useState<SourceVisibility>(defaultSourceVisibility);
  const [mapSettings, setMapSettings] = useState<MapSettings>(defaultMapSettings);
  const [activeSegment, setActiveSegment] = useState<ActiveSegment | undefined>();
  const [region, setRegion] = useState<AxisAlignedRegion | undefined>();
  const [transformMode, setTransformMode] = useState<TransformMode>("raw");
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [loadError, setLoadError] = useState<string | undefined>();
  const previousEffectiveSourceVisibility = useRef<SourceVisibility | undefined>();

  const activeFile = files[activeIndex];
  const effectiveSourceVisibility = useMemo(
    () => (activeFile ? normalizeSourceVisibility(activeFile, sourceVisibility) : sourceVisibility),
    [activeFile, sourceVisibility],
  );
  const visibleGpsPoints = useMemo(
    () => (activeFile ? displayGpsPointsWithSources(activeFile, effectiveSourceVisibility) : []),
    [activeFile, effectiveSourceVisibility],
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
  const stats = useMemo(() => (activeFile ? summarizeVta(activeFile) : undefined), [activeFile]);

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
        setLoadError("No .Vta files were found in the selected input.");
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
      setActiveSegment(undefined);
      setRegion(undefined);
      setTransformMode("raw");
      setLineEnding("lf");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load selected file.");
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
    setSourceVisibility(nextVisibility);
    setSelectedPointIndex(0);
    setActiveSegment(undefined);
    setRegion(undefined);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>OpenVTA Analyzer</strong>
          <span>Client-side VTA route, sensor, calibration, and filtering workspace</span>
        </div>
        <div className="topbar-actions">
          {files.length > 1 ? (
            <select
              aria-label="Active file"
              value={activeIndex}
              onChange={(event) => {
                setActiveIndex(Number(event.target.value));
                setSelectedPointIndex(0);
                setActiveSegment(undefined);
                setRegion(undefined);
              }}
            >
              {files.map((file, index) => (
                <option value={index} key={file.id}>
                  {file.sourceName}
                </option>
              ))}
            </select>
          ) : null}
          <label className="button ghost">
            <FileUp size={16} aria-hidden />
            Open VTA/ZIP
            <input
              hidden
              type="file"
              multiple
              accept=".vta,.Vta,.zip"
              onChange={(event) => {
                void loadFiles(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" className="button ghost" onClick={loadSample}>
            <TestTube2 size={16} aria-hidden />
            Load sample
          </button>
          <button type="button" className="button ghost" onClick={loadSampleCalibration} disabled={!activeFile}>
            <Settings size={16} aria-hidden />
            Sample CAL
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="privacy-note">
          Files are parsed locally in this browser. No GPS traces or sensor records are uploaded by the app.
        </div>

        {!activeFile ? (
          <FileDrop onFiles={(incoming) => void loadFiles(incoming)} loadError={loadError} onSample={loadSample} />
        ) : (
          <div className="workspace-grid">
            <aside className="file-rail">
              <FileTray
                files={files}
                activeFileId={activeFile.id}
                onSelectFile={selectFile}
                onRemoveFile={removeFile}
              />
            </aside>

            <section className="analysis-main">
              <nav className="tabs" aria-label="Analyzer sections">
                {tabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.key}
                    className={tab.key === activeTab ? "tab active" : "tab"}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {activeTab === "overview" && stats ? (
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

              {activeTab === "charts" ? (
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

              {activeTab === "tables" ? (
                <Tables
                  file={activeFile}
                  sensors={transformedSensors}
                  visiblePoints={visibleGpsPoints}
                  activeSegment={activeSegment}
                />
              ) : null}

              {activeTab === "calibration" ? (
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

              {activeTab === "export" && stats ? (
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
            </section>

            <aside className="analysis-inspector">
              <WorkspaceStatus
                sourceVisibility={effectiveSourceVisibility}
                onSourceVisibility={updateSourceVisibility}
                transformMode={transformMode}
                onTransformMode={setTransformMode}
                activeSegment={activeSegment}
                onActiveSegment={setActiveSegment}
              />
            </aside>
          </div>
        )}

        <footer className="privacy-note">
          <Gauge size={15} aria-hidden /> Map tiles use the configured interactive tile source only for visible views.
          Exported files are generated locally with browser downloads. <Download size={15} aria-hidden />
        </footer>
      </main>
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
