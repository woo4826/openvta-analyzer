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
import { Charts } from "./Charts";
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

const transformOptions: Array<{ value: TransformMode; label: string }> = [
  { value: "raw", label: "Raw" },
  { value: "calibrated", label: "Calibrated" },
  { value: "filtered", label: "Filtered" },
  { value: "compare", label: "Compare" },
];

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
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<CalibrationPreset[]>(() => loadCalibrationPresets());
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const estimatedFromSession = useMemo(() => estimateCalibrationOffsets(sensors, {}, file.sourceName), [file, sensors]);
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? presets[0],
    [presets, selectedPresetId],
  );
  const previewSensors = useMemo(() => {
    if (transformMode === "raw") {
      return sensors;
    }
    if (transformMode === "calibrated") {
      return applyCalibration(sensors, calibration);
    }
    return transformedSensors.length ? transformedSensors : applyCalibration(sensors, calibration);
  }, [calibration, sensors, transformMode, transformedSensors]);

  function updateOffset(key: "x" | "y" | "z", value: number) {
    const base = calibration ?? estimatedFromSession;
    if (!base) return;
    onCalibration({ ...base, [key]: value });
  }

  function estimateSelectedWindow() {
    const offsets = estimateCalibrationOffsets(sensors, parseWindow(windowStart, windowEnd), file.sourceName);
    if (!offsets) {
      setStatusMessage("No sensor samples were found in that static window.");
      return;
    }
    onCalibration(offsets);
    setStatusMessage(`Estimated ${offsets.sampleCount} samples from the selected window.`);
  }

  function estimateCurrentFile() {
    if (!estimatedFromSession) {
      setStatusMessage("No sensor samples were found in the current file.");
      return;
    }
    onCalibration(estimatedFromSession);
    setStatusMessage(`Estimated ${estimatedFromSession.sampleCount} samples from the current file.`);
  }

  function updatePresets(nextPresets: CalibrationPreset[]) {
    setPresets(nextPresets);
    saveCalibrationPresets(nextPresets);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      setStatusMessage("Enter a preset name before saving.");
      return;
    }
    const offsets = calibration ?? estimatedFromSession;
    if (!offsets) {
      setStatusMessage("No calibration offsets are available to save.");
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
    setStatusMessage("Preset saved.");
  }

  function applyPreset() {
    if (!selectedPreset) {
      setStatusMessage("Choose a preset to apply.");
      return;
    }
    onCalibration(selectedPreset.offsets);
    setPresetName(selectedPreset.name);
    setStatusMessage(`Applied preset ${selectedPreset.name}.`);
  }

  function deletePreset() {
    if (!selectedPreset) {
      setStatusMessage("Choose a preset to delete.");
      return;
    }
    const nextPresets = removeCalibrationPreset(presets, selectedPreset.id);
    updatePresets(nextPresets);
    setSelectedPresetId(nextPresets[0]?.id ?? "");
    setStatusMessage(`Deleted preset ${selectedPreset.name}.`);
  }

  async function importPresetFile(file: File) {
    const imported = importCalibrationPresets(await file.text());
    if (!imported.length) {
      setStatusMessage("No valid calibration presets were found in that JSON file.");
      return;
    }
    setPresets((current) => {
      const nextPresets = imported.reduce(upsertCalibrationPreset, current);
      saveCalibrationPresets(nextPresets);
      return nextPresets;
    });
    setSelectedPresetId(imported[imported.length - 1].id);
    setStatusMessage(`Imported ${imported.length} calibration preset${imported.length === 1 ? "" : "s"}.`);
  }

  return (
    <section className="content-band">
      <div className="panel">
        <div className="panel-header">
          <h2>Calibration and Filtering</h2>
          <SlidersHorizontal size={18} aria-hidden />
        </div>
        <div className="panel-body content-band">
          <div className="row-actions">
            <label className="button">
              Load CAL file
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
              Estimate from current file
            </button>
            <button type="button" className="button" onClick={() => onCalibration(undefined)}>
              Reset calibration
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Window start seconds</span>
              <input
                type="number"
                step="0.001"
                value={windowStart}
                onChange={(event) => setWindowStart(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Window end seconds</span>
              <input
                type="number"
                step="0.001"
                value={windowEnd}
                onChange={(event) => setWindowEnd(event.target.value)}
              />
            </label>
            <div className="field">
              <span>Static window</span>
              <button type="button" className="button" onClick={estimateSelectedWindow}>
                Estimate selected window
              </button>
              <small>Blank values are unbounded. Reversed values are normalized.</small>
            </div>
          </div>

          <div className="form-grid">
            <OffsetField label="GX offset" value={calibration?.x} onChange={(value) => updateOffset("x", value)} />
            <OffsetField label="GY offset" value={calibration?.y} onChange={(value) => updateOffset("y", value)} />
            <OffsetField label="GZ offset" value={calibration?.z} onChange={(value) => updateOffset("z", value)} />
          </div>

          <div className="metric-grid">
            <Metric label="Calibration source" value={calibration?.sourceName ?? "None"} />
            <Metric label="Samples" value={calibration ? String(calibration.sampleCount) : "0"} />
            <Metric label="Unit" value={calibration?.unit ?? sensors[0]?.accelUnit ?? "n/a"} />
            <Metric label="Filter sample rate" value={sampleRateHz ? `${sampleRateHz.toFixed(1)} Hz` : "n/a"} />
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Preset name</span>
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} />
            </label>
            <div className="field">
              <span>Preset actions</span>
              <div className="row-actions">
                <button type="button" className="button primary" onClick={savePreset}>
                  Save preset
                </button>
                <button type="button" className="button" onClick={applyPreset} disabled={!selectedPreset}>
                  Apply preset
                </button>
                <button type="button" className="button" onClick={deletePreset} disabled={!selectedPreset}>
                  Delete preset
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
              Export presets JSON
            </button>
            <label className="button">
              Import presets JSON
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
            <div className="row-actions" aria-label="Saved calibration presets">
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
              <span>Low-pass filter</span>
              <select
                value={filterSettings.enabled ? "on" : "off"}
                onChange={(event) => onFilterSettings({ ...filterSettings, enabled: event.target.value === "on" })}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
            <label className="field">
              <span>Cutoff Hz</span>
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
              <span>Channels</span>
              <select
                value={channelValue(filterSettings)}
                onChange={(event) => onFilterSettings({ ...filterSettings, channels: channelsFromValue(event.target.value) })}
              >
                <option value="xyz">GX + GY + GZ</option>
                <option value="xy">GX + GY</option>
                <option value="z">GZ only</option>
              </select>
            </label>
          </div>

          {filterWarning ? <div className="warning-item">{filterWarning}</div> : null}
          {statusMessage ? <div className="warning-item">{statusMessage}</div> : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Transform preview</h3>
          <SegmentedControl
            ariaLabel="Calibration preview transform mode"
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
