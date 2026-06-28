import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { applyCalibration, estimateCalibrationOffsets } from "../domain/calibration";
import { downloadText } from "../domain/export";
import {
  exportCalibrationPresets,
  importCalibrationPresets,
  loadCalibrationPresets,
  removeCalibrationPreset,
  saveCalibrationPresets,
  upsertCalibrationPreset,
} from "../domain/settings";
import type {
  CalibrationOffsets,
  CalibrationPreset,
  CalibrationWindow,
  FilterSettings,
  SensorPoint,
  TransformMode,
  VtaFile,
} from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { Charts, type AccelerationSensorSet } from "./Charts";
import { SegmentedControl } from "./ui";

interface CalibrationPanelProps {
  file: VtaFile;
  sensors: SensorPoint[];
  transformedSensors: SensorPoint[];
  calibration?: CalibrationOffsets;
  onCalibration: (offsets?: CalibrationOffsets) => void;
  onCalibrationFile: (file: File) => void;
  filterSettings: FilterSettings;
  onFilterSettings: (settings: FilterSettings) => void;
  filterWarning?: string;
  sampleRateHz?: number;
  transformMode: TransformMode;
  onTransformMode: (mode: TransformMode) => void;
}

export function CalibrationPanel({
  file,
  sensors,
  transformedSensors,
  calibration,
  onCalibration,
  onCalibrationFile,
  filterSettings,
  onFilterSettings,
  filterWarning,
  sampleRateHz,
  transformMode,
  onTransformMode,
}: CalibrationPanelProps) {
  const { t } = useI18n();
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<CalibrationPreset[]>(() => loadCalibrationPresets());
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const transformOptions = useMemo<Array<{ value: TransformMode; label: string }>>(
    () => [
      { value: "raw", label: t("workspace.transform.raw") },
      { value: "calibrated", label: t("workspace.transform.calibrated") },
      { value: "filtered", label: t("workspace.transform.filtered") },
      { value: "compare", label: t("workspace.transform.compare") },
    ],
    [t],
  );
  const estimatedFromSession = useMemo(() => estimateCalibrationOffsets(sensors, {}, file.sourceName), [file, sensors]);
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? presets[0],
    [presets, selectedPresetId],
  );
  const previewSensors = useMemo(() => {
    const calibratedSensors = applyCalibration(sensors, calibration);
    const filteredSensors = transformedSensors.length ? transformedSensors : calibratedSensors;
    return sensorsForTransformMode(transformMode, sensors, calibratedSensors, filteredSensors);
  }, [calibration, sensors, transformMode, transformedSensors]);
  const previewAccelerationSensorSets = useMemo(() => {
    if (transformMode !== "compare") {
      return undefined;
    }
    const calibratedSensors = applyCalibration(sensors, calibration);
    const filteredSensors = transformedSensors.length ? transformedSensors : calibratedSensors;
    return accelerationSensorSets(sensors, calibratedSensors, filteredSensors, t);
  }, [calibration, sensors, t, transformMode, transformedSensors]);
  const localizedFilterWarning = filterWarning ? localizeFilterWarning(filterWarning, t) : undefined;

  function updateOffset(key: "x" | "y" | "z", value: number) {
    const base = calibration ?? estimatedFromSession;
    if (!base) return;
    onCalibration({ ...base, [key]: value });
  }

  function estimateSelectedWindow() {
    const offsets = estimateCalibrationOffsets(sensors, parseWindow(windowStart, windowEnd), file.sourceName);
    if (!offsets) {
      setStatusMessage(t("calibration.status.noSamplesStaticWindow"));
      return;
    }
    onCalibration(offsets);
    setStatusMessage(t("calibration.status.estimatedSelectedWindow", { count: offsets.sampleCount }));
  }

  function estimateCurrentFile() {
    if (!estimatedFromSession) {
      setStatusMessage(t("calibration.status.noSamplesCurrentFile"));
      return;
    }
    onCalibration(estimatedFromSession);
    setStatusMessage(t("calibration.status.estimatedCurrentFile", { count: estimatedFromSession.sampleCount }));
  }

  function updatePresets(nextPresets: CalibrationPreset[]) {
    setPresets(nextPresets);
    saveCalibrationPresets(nextPresets);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      setStatusMessage(t("calibration.status.enterPresetName"));
      return;
    }
    const offsets = calibration ?? estimatedFromSession;
    if (!offsets) {
      setStatusMessage(t("calibration.status.noOffsetsToSave"));
      return;
    }
    const existingPreset =
      (selectedPreset?.name.trim().toLowerCase() === name.toLowerCase() ? selectedPreset : undefined) ??
      presets.find((preset) => preset.name.trim().toLowerCase() === name.toLowerCase());
    const preset: CalibrationPreset = {
      id: existingPreset?.id ?? createPresetId(name),
      name,
      createdAt: existingPreset?.createdAt ?? Date.now(),
      offsets,
    };
    updatePresets(upsertCalibrationPreset(presets, preset));
    setSelectedPresetId(preset.id);
    setStatusMessage(t("calibration.status.presetSaved"));
  }

  function applyPreset() {
    if (!selectedPreset) {
      setStatusMessage(t("calibration.status.choosePresetToApply"));
      return;
    }
    onCalibration(selectedPreset.offsets);
    setPresetName(selectedPreset.name);
    setStatusMessage(t("calibration.status.appliedPreset", { name: selectedPreset.name }));
  }

  function deletePreset() {
    if (!selectedPreset) {
      setStatusMessage(t("calibration.status.choosePresetToDelete"));
      return;
    }
    const nextPresets = removeCalibrationPreset(presets, selectedPreset.id);
    updatePresets(nextPresets);
    setSelectedPresetId(nextPresets[0]?.id ?? "");
    setStatusMessage(t("calibration.status.deletedPreset", { name: selectedPreset.name }));
  }

  async function importPresetFile(file: File) {
    const imported = importCalibrationPresets(await file.text());
    if (!imported.length) {
      setStatusMessage(t("calibration.status.noValidPresets"));
      return;
    }
    setPresets((current) => {
      const nextPresets = imported.reduce(upsertCalibrationPreset, current);
      saveCalibrationPresets(nextPresets);
      return nextPresets;
    });
    setSelectedPresetId(imported[imported.length - 1].id);
    setStatusMessage(
      t(imported.length === 1 ? "calibration.status.importedPresets.one" : "calibration.status.importedPresets.other", {
        count: imported.length,
      }),
    );
  }

  return (
    <section className="content-band">
      <div className="panel">
        <div className="panel-header">
          <h2>{t("calibration.title")}</h2>
          <SlidersHorizontal size={18} aria-hidden />
        </div>
        <div className="panel-body content-band">
          <div className="row-actions">
            <label className="button">
              {t("calibration.loadCalFile")}
              <input
                hidden
                type="file"
                accept=".cal,.CAL,.vta,.Vta"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onCalibrationFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button type="button" className="button" onClick={estimateCurrentFile}>
              {t("calibration.estimateFromCurrentFile")}
            </button>
            <button type="button" className="button" onClick={() => onCalibration(undefined)}>
              {t("calibration.resetCalibration")}
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>{t("calibration.windowStartSeconds")}</span>
              <input
                type="number"
                step="0.001"
                value={windowStart}
                onChange={(event) => setWindowStart(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("calibration.windowEndSeconds")}</span>
              <input
                type="number"
                step="0.001"
                value={windowEnd}
                onChange={(event) => setWindowEnd(event.target.value)}
              />
            </label>
            <div className="field">
              <span>{t("calibration.staticWindow")}</span>
              <button type="button" className="button" onClick={estimateSelectedWindow}>
                {t("calibration.estimateSelectedWindow")}
              </button>
              <small>{t("calibration.staticWindowHelp")}</small>
            </div>
          </div>

          <div className="form-grid">
            <OffsetField label={t("calibration.offset.gx")} value={calibration?.x} onChange={(value) => updateOffset("x", value)} />
            <OffsetField label={t("calibration.offset.gy")} value={calibration?.y} onChange={(value) => updateOffset("y", value)} />
            <OffsetField label={t("calibration.offset.gz")} value={calibration?.z} onChange={(value) => updateOffset("z", value)} />
          </div>

          <div className="metric-grid">
            <Metric label={t("calibration.source")} value={calibration?.sourceName ?? t("calibration.none")} />
            <Metric label={t("calibration.samples")} value={calibration ? String(calibration.sampleCount) : "0"} />
            <Metric label={t("calibration.unit")} value={calibration?.unit ?? sensors[0]?.accelUnit ?? t("calibration.unavailable")} />
            <Metric
              label={t("calibration.filterSampleRate")}
              value={sampleRateHz ? `${sampleRateHz.toFixed(1)} Hz` : t("calibration.unavailable")}
            />
          </div>

          <div className="form-grid">
            <label className="field">
              <span>{t("calibration.presetName")}</span>
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} />
            </label>
            <div className="field">
              <span>{t("calibration.presetActions")}</span>
              <div className="row-actions">
                <button type="button" className="button primary" onClick={savePreset}>
                  {t("calibration.savePreset")}
                </button>
                <button type="button" className="button" onClick={applyPreset} disabled={!selectedPreset}>
                  {t("calibration.applyPreset")}
                </button>
                <button type="button" className="button" onClick={deletePreset} disabled={!selectedPreset}>
                  {t("calibration.deletePreset")}
                </button>
              </div>
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="button"
              onClick={() =>
                downloadText("calibration-presets.json", exportCalibrationPresets(presets), "application/json")
              }
            >
              {t("calibration.exportPresetsJson")}
            </button>
            <label className="button">
              {t("calibration.importPresetsJson")}
              <input
                hidden
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importPresetFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {presets.length ? (
            <div className="row-actions" aria-label={t("calibration.savedPresetsAria")}>
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={preset.id === selectedPreset?.id ? "button primary" : "button"}
                  onClick={() => {
                    setSelectedPresetId(preset.id);
                    setPresetName(preset.name);
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field">
              <span>{t("calibration.lowPassFilter")}</span>
              <select
                value={filterSettings.enabled ? "on" : "off"}
                onChange={(event) => onFilterSettings({ ...filterSettings, enabled: event.target.value === "on" })}
              >
                <option value="off">{t("calibration.off")}</option>
                <option value="on">{t("calibration.on")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("calibration.cutoffHz")}</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={filterSettings.cutoffHz}
                onChange={(event) =>
                  onFilterSettings({ ...filterSettings, cutoffHz: Number(event.target.value) || 0.1 })
                }
              />
            </label>
            <label className="field">
              <span>{t("calibration.channels")}</span>
              <select
                value={channelValue(filterSettings)}
                onChange={(event) => onFilterSettings({ ...filterSettings, channels: channelsFromValue(event.target.value) })}
              >
                <option value="xyz">{t("calibration.channels.xyz")}</option>
                <option value="xy">{t("calibration.channels.xy")}</option>
                <option value="z">{t("calibration.channels.zOnly")}</option>
              </select>
            </label>
          </div>

          {localizedFilterWarning ? <div className="warning-item">{localizedFilterWarning}</div> : null}
          {statusMessage ? <div className="warning-item">{statusMessage}</div> : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>{t("calibration.transformPreview")}</h3>
          <SegmentedControl
            ariaLabel={t("calibration.previewTransformModeAria")}
            options={transformOptions}
            value={transformMode}
            onChange={(value) => onTransformMode(value as TransformMode)}
            selectionRole="button"
          />
        </div>
        <div className="panel-body">
          <Charts
            file={file}
            sensors={previewSensors}
            accelerationSensorSets={previewAccelerationSensorSets}
            selectedPointIndex={0}
            onSelectedPointIndex={() => undefined}
            transformMode={transformMode}
          />
        </div>
      </div>
    </section>
  );
}

function OffsetField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step="0.001"
        value={value ?? ""}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function channelValue(settings: FilterSettings): string {
  if (settings.channels.x && settings.channels.y && settings.channels.z) return "xyz";
  if (settings.channels.x && settings.channels.y) return "xy";
  return "z";
}

function channelsFromValue(value: string): FilterSettings["channels"] {
  if (value === "xy") return { x: true, y: true, z: false };
  if (value === "z") return { x: false, y: false, z: true };
  return { x: true, y: true, z: true };
}

function localizeFilterWarning(message: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (message === "Filter skipped because the cutoff frequency is outside the valid range.") {
    return t("calibration.filterWarning.cutoffOutOfRange");
  }
  if (message === "Sensor timestamps are irregular; an effective sample rate was estimated for filtering.") {
    return t("calibration.filterWarning.irregularTimestamps");
  }
  return message;
}

function parseWindow(start: string, end: string): CalibrationWindow {
  return {
    startElapsedSeconds: parseOptionalNumber(start),
    endElapsedSeconds: parseOptionalNumber(end),
  };
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createPresetId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "preset";
  return `calibration-${slug}-${Date.now()}`;
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
  t: ReturnType<typeof useI18n>["t"],
): AccelerationSensorSet[] {
  return [
    { label: t("workspace.transform.raw"), sensors: rawSensors },
    { label: t("workspace.transform.calibrated"), sensors: calibratedSensors },
    { label: t("workspace.transform.filtered"), sensors: filteredSensors },
  ];
}
