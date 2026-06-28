import { describe, expect, it, vi } from "vitest";
import {
  exportCalibrationPresets,
  importCalibrationPresets,
  loadJsonSetting,
  removeCalibrationPreset,
  saveJsonSetting,
  upsertCalibrationPreset,
} from "../settings";
import type { CalibrationPreset } from "../types";

describe("settings helpers", () => {
  it("falls back when local storage contains invalid JSON", () => {
    const store = new Map<string, string>([["broken", "{"]]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadJsonSetting("broken", { ok: true }, storage)).toEqual({ ok: true });
  });

  it("saves and upserts calibration presets", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: vi.fn(),
    };
    const preset: CalibrationPreset = {
      id: "preset-1",
      name: "Static pad",
      createdAt: 1700000000000,
      offsets: { x: 0.1, y: -0.2, z: 0.3, unit: "mps2", sampleCount: 30 },
    };
    const presets = upsertCalibrationPreset([], preset);
    saveJsonSetting("presets", presets, storage);
    expect(loadJsonSetting<CalibrationPreset[]>("presets", [], storage)[0].name).toBe("Static pad");
  });

  it("removes and imports calibration presets", () => {
    const preset: CalibrationPreset = {
      id: "preset-1",
      name: "Static pad",
      createdAt: 1700000000000,
      offsets: { x: 0.1, y: -0.2, z: 0.3, unit: "mps2", sampleCount: 30 },
    };
    expect(removeCalibrationPreset([preset], "preset-1")).toHaveLength(0);
    expect(importCalibrationPresets(exportCalibrationPresets([preset]))).toEqual([preset]);
    expect(importCalibrationPresets("{")).toEqual([]);
  });
});
