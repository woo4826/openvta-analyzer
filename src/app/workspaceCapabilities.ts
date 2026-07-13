import type { SensorPoint, TransformMode } from "../domain/types";

export function isFilterTransformReady(
  enabled: boolean,
  calibratedSensors: readonly SensorPoint[],
  filteredSensors: readonly SensorPoint[],
): boolean {
  return enabled && filteredSensors !== calibratedSensors;
}

export function normalizeTransformMode(
  mode: TransformMode,
  calibrationReady: boolean,
  filterReady: boolean,
): TransformMode {
  if (mode === "calibrated" && !calibrationReady) return "raw";
  if (mode === "filtered" && !filterReady) return "raw";
  if (mode === "compare" && !calibrationReady && !filterReady) return "raw";
  return mode;
}
