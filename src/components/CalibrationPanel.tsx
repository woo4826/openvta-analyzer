import { SlidersHorizontal } from "lucide-react";
import { applyCalibration, estimateCalibrationOffsets } from "../domain/calibration";
import type { CalibrationOffsets, FilterSettings, SensorPoint, VtaFile } from "../domain/types";
import { Charts } from "./Charts";

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
}: CalibrationPanelProps) {
  const estimatedFromSession = estimateCalibrationOffsets(sensors, {}, file.sourceName);

  function updateOffset(key: "x" | "y" | "z", value: number) {
    const base = calibration ?? estimatedFromSession;
    if (!base) return;
    onCalibration({ ...base, [key]: value });
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
                accept=".vta,.Vta"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onCalibrationFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button type="button" className="button" onClick={() => onCalibration(estimatedFromSession)}>
              Estimate from current file
            </button>
            <button type="button" className="button" onClick={() => onCalibration(undefined)}>
              Reset calibration
            </button>
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
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Raw vs transformed preview</h3>
        </div>
        <div className="panel-body">
          <Charts file={file} sensors={transformedSensors.length ? transformedSensors : applyCalibration(sensors, calibration)} selectedPointIndex={0} onSelectedPointIndex={() => undefined} />
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

