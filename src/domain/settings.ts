import type { CalibrationPreset, LapAnalysisSettings } from "./types";

type JsonStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const CALIBRATION_PRESETS_STORAGE_KEY = "openvta.calibrationPresets.v1";
export const ONBOARDING_TOUR_STORAGE_KEY = "openvta.onboardingTour.v1";
export const LAP_ANALYSIS_SETTINGS_STORAGE_KEY = "openvta.lapAnalysisSettings.v1";

export interface OnboardingTourState {
  status: "new" | "skipped" | "completed";
  version: 1;
  skippedAt?: number;
  completedAt?: number;
}

export function loadJsonSetting<T>(key: string, fallback: T, storage: JsonStorage = defaultStorage()): T {
  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJsonSetting<T>(key: string, value: T, storage: JsonStorage = defaultStorage()): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Persisted settings are optional. The app must remain usable when storage is blocked.
  }
}

export function loadCalibrationPresets(storage: JsonStorage = defaultStorage()): CalibrationPreset[] {
  return coerceCalibrationPresets(loadJsonSetting<unknown>(CALIBRATION_PRESETS_STORAGE_KEY, [], storage));
}

export function saveCalibrationPresets(
  presets: CalibrationPreset[],
  storage: JsonStorage = defaultStorage(),
): void {
  saveJsonSetting(CALIBRATION_PRESETS_STORAGE_KEY, presets, storage);
}

export function loadOnboardingTourState(storage: JsonStorage = defaultStorage()): OnboardingTourState {
  return coerceOnboardingTourState(
    loadJsonSetting<unknown>(ONBOARDING_TOUR_STORAGE_KEY, defaultOnboardingTourState(), storage),
  );
}

export function saveOnboardingTourState(
  state: OnboardingTourState,
  storage: JsonStorage = defaultStorage(),
): void {
  saveJsonSetting(ONBOARDING_TOUR_STORAGE_KEY, state, storage);
}

export function defaultLapAnalysisSettings(): LapAnalysisSettings {
  return { includePartialLapSectors: false };
}

export function loadLapAnalysisSettings(storage: JsonStorage = defaultStorage()): LapAnalysisSettings {
  const value = loadJsonSetting<unknown>(
    LAP_ANALYSIS_SETTINGS_STORAGE_KEY,
    defaultLapAnalysisSettings(),
    storage,
  );
  if (isRecord(value) && typeof value.includePartialLapSectors === "boolean") {
    return { includePartialLapSectors: value.includePartialLapSectors };
  }
  return defaultLapAnalysisSettings();
}

export function saveLapAnalysisSettings(
  settings: LapAnalysisSettings,
  storage: JsonStorage = defaultStorage(),
): void {
  saveJsonSetting(LAP_ANALYSIS_SETTINGS_STORAGE_KEY, settings, storage);
}

export function skippedOnboardingTourState(timestamp = Date.now()): OnboardingTourState {
  return { status: "skipped", skippedAt: timestamp, version: 1 };
}

export function completedOnboardingTourState(timestamp = Date.now()): OnboardingTourState {
  return { status: "completed", completedAt: timestamp, version: 1 };
}

export function defaultOnboardingTourState(): OnboardingTourState {
  return { status: "new", version: 1 };
}

export function upsertCalibrationPreset(
  presets: CalibrationPreset[],
  preset: CalibrationPreset,
): CalibrationPreset[] {
  const index = presets.findIndex((candidate) => candidate.id === preset.id);
  if (index === -1) {
    return [...presets, preset];
  }
  return presets.map((candidate, candidateIndex) => (candidateIndex === index ? preset : candidate));
}

export function removeCalibrationPreset(presets: CalibrationPreset[], id: string): CalibrationPreset[] {
  return presets.filter((preset) => preset.id !== id);
}

export function mergeImportedCalibrationPresets(
  presets: CalibrationPreset[],
  text: string,
): CalibrationPreset[] {
  const imported = importCalibrationPresets(text);
  if (!imported.length) {
    return presets;
  }
  return imported.reduce(upsertCalibrationPreset, presets);
}

export function exportCalibrationPresets(presets: CalibrationPreset[]): string {
  return JSON.stringify(presets, null, 2);
}

export function importCalibrationPresets(text: string): CalibrationPreset[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    const presets = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.presets)
        ? parsed.presets
        : [];
    return presets.filter(isCalibrationPreset);
  } catch {
    return [];
  }
}

function coerceCalibrationPresets(value: unknown): CalibrationPreset[] {
  if (Array.isArray(value)) {
    return value.filter(isCalibrationPreset);
  }
  return [];
}

function coerceOnboardingTourState(value: unknown): OnboardingTourState {
  if (!isRecord(value) || value.version !== 1) {
    return defaultOnboardingTourState();
  }

  if (value.status === "new") {
    return defaultOnboardingTourState();
  }

  if (value.status === "skipped" && isOptionalFiniteNumber(value.skippedAt)) {
    return {
      status: "skipped",
      skippedAt: value.skippedAt,
      version: 1,
    };
  }

  if (value.status === "completed" && isOptionalFiniteNumber(value.completedAt)) {
    return {
      status: "completed",
      completedAt: value.completedAt,
      version: 1,
    };
  }

  return defaultOnboardingTourState();
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function defaultStorage(): JsonStorage {
  try {
    if ("localStorage" in globalThis) {
      return globalThis.localStorage;
    }
  } catch {
    // Accessing localStorage can throw in restricted browser contexts.
  }
  return noopStorage;
}

const noopStorage: JsonStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function isCalibrationPreset(value: unknown): value is CalibrationPreset {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return false;
  }
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) {
    return false;
  }
  const offsets = value.offsets;
  return (
    isRecord(offsets) &&
    typeof offsets.x === "number" &&
    Number.isFinite(offsets.x) &&
    typeof offsets.y === "number" &&
    Number.isFinite(offsets.y) &&
    typeof offsets.z === "number" &&
    Number.isFinite(offsets.z) &&
    (offsets.unit === "mps2" || offsets.unit === "g") &&
    typeof offsets.sampleCount === "number" &&
    Number.isInteger(offsets.sampleCount) &&
    offsets.sampleCount >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
