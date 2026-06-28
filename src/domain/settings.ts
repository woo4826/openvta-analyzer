import type { CalibrationPreset } from "./types";

type JsonStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
  storage.setItem(key, JSON.stringify(value));
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

function defaultStorage(): JsonStorage {
  if ("localStorage" in globalThis) {
    return globalThis.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

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
