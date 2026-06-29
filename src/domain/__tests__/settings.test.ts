import { describe, expect, it, vi } from "vitest";
import {
  CALIBRATION_PRESETS_STORAGE_KEY,
  ONBOARDING_TOUR_STORAGE_KEY,
  completedOnboardingTourState,
  exportCalibrationPresets,
  importCalibrationPresets,
  loadCalibrationPresets,
  loadJsonSetting,
  loadOnboardingTourState,
  mergeImportedCalibrationPresets,
  removeCalibrationPreset,
  saveCalibrationPresets,
  saveJsonSetting,
  saveOnboardingTourState,
  skippedOnboardingTourState,
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

  it("does not throw when setting storage is blocked", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
      removeItem: vi.fn(),
    };

    expect(() => saveJsonSetting("presets", [calibrationPreset()], storage)).not.toThrow();
  });

  it("loads and saves calibration presets through the versioned storage key", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: vi.fn(),
    };
    const preset = calibrationPreset({ id: "preset-1", name: "Static pad" });

    saveCalibrationPresets([preset], storage);

    expect(store.has(CALIBRATION_PRESETS_STORAGE_KEY)).toBe(true);
    expect(loadCalibrationPresets(storage)).toEqual([preset]);
  });

  it("falls back to no-op storage when localStorage access is blocked", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });

    try {
      expect(loadCalibrationPresets()).toEqual([]);
      expect(() => saveCalibrationPresets([calibrationPreset()])).not.toThrow();
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "localStorage", descriptor);
      }
    }
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
    expect(importCalibrationPresets(JSON.stringify({ presets: [preset] }))).toEqual([preset]);
    expect(importCalibrationPresets("{")).toEqual([]);
  });

  it("imports mixed valid and invalid calibration presets without dropping valid entries", () => {
    const valid = calibrationPreset({ id: "valid", name: "Valid" });

    expect(
      importCalibrationPresets(
        JSON.stringify({
          presets: [
            valid,
            {
              id: "bad",
              name: "Bad",
              createdAt: 1700000000000,
              offsets: { x: Number.POSITIVE_INFINITY, y: 0, z: 0, unit: "mps2", sampleCount: 30 },
            },
          ],
        }),
      ),
    ).toEqual([valid]);
  });

  it("merges imported presets by id and leaves existing presets untouched for invalid imports", () => {
    const original = calibrationPreset({ id: "preset-1", name: "Static pad" });
    const updated = calibrationPreset({
      id: "preset-1",
      name: "Updated static pad",
      offsets: { x: 1, y: 2, z: 3, unit: "mps2", sampleCount: 10 },
    });

    expect(mergeImportedCalibrationPresets([original], exportCalibrationPresets([updated]))).toEqual([updated]);
    expect(mergeImportedCalibrationPresets([original], "{")).toEqual([original]);
  });

  it("rejects calibration presets with non-finite offsets or invalid sample counts", () => {
    expect(
      importCalibrationPresets(
        String.raw`[
          {
            "id": "bad-offset",
            "name": "Bad offset",
            "createdAt": 1700000000000,
            "offsets": { "x": 1e999, "y": 0, "z": 0, "unit": "mps2", "sampleCount": 30 }
          },
          {
            "id": "bad-sample-count",
            "name": "Bad sample count",
            "createdAt": 1700000000000,
            "offsets": { "x": 0, "y": 0, "z": 0, "unit": "mps2", "sampleCount": 1.5 }
          }
        ]`,
      ),
    ).toEqual([]);
  });

  it("loads default onboarding tour state when storage is missing or invalid", () => {
    const emptyStorage = {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const invalidStorage = {
      getItem: () => "{",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(loadOnboardingTourState(emptyStorage)).toEqual({ status: "new", version: 1 });
    expect(loadOnboardingTourState(invalidStorage)).toEqual({ status: "new", version: 1 });
  });

  it("saves skipped and completed onboarding tour states", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: vi.fn(),
    };

    saveOnboardingTourState(skippedOnboardingTourState(1700000000000), storage);
    expect(loadOnboardingTourState(storage)).toEqual({
      status: "skipped",
      skippedAt: 1700000000000,
      version: 1,
    });

    saveOnboardingTourState(completedOnboardingTourState(1700000001000), storage);
    expect(loadOnboardingTourState(storage)).toEqual({
      status: "completed",
      completedAt: 1700000001000,
      version: 1,
    });
    expect(store.has(ONBOARDING_TOUR_STORAGE_KEY)).toBe(true);
  });

  it("rejects malformed onboarding tour states", () => {
    const storage = {
      getItem: () => JSON.stringify({ status: "completed", completedAt: "soon", version: 1 }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(loadOnboardingTourState(storage)).toEqual({ status: "new", version: 1 });
  });
});

function calibrationPreset(overrides: Partial<CalibrationPreset> = {}): CalibrationPreset {
  return {
    id: "preset-1",
    name: "Static pad",
    createdAt: 1700000000000,
    offsets: { x: 0.1, y: -0.2, z: 0.3, unit: "mps2", sampleCount: 30 },
    ...overrides,
  };
}
