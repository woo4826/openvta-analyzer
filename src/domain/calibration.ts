import { GRAVITY_MPS2, type CalibrationOffsets, type CalibrationWindow, type SensorPoint } from "./types";

export function estimateCalibrationOffsets(
  sensors: SensorPoint[],
  window: CalibrationWindow = {},
  sourceName?: string,
): CalibrationOffsets | undefined {
  const normalizedWindow = normalizeCalibrationWindow(window);
  const selected = sensors.filter((sensor) => {
    if (
      normalizedWindow.startElapsedSeconds !== undefined &&
      sensor.elapsedSeconds < normalizedWindow.startElapsedSeconds
    ) {
      return false;
    }
    if (normalizedWindow.endElapsedSeconds !== undefined && sensor.elapsedSeconds > normalizedWindow.endElapsedSeconds) {
      return false;
    }
    return true;
  });
  if (!selected.length) {
    return undefined;
  }

  const unit = selected[0].accelUnit;
  const sameUnit = selected.filter((sensor) => sensor.accelUnit === unit);
  const targetZ = unit === "g" ? 1 : GRAVITY_MPS2;
  return {
    x: average(sameUnit.map((sensor) => sensor.accelX)),
    y: average(sameUnit.map((sensor) => sensor.accelY)),
    z: average(sameUnit.map((sensor) => sensor.accelZ)) - targetZ,
    unit,
    sampleCount: sameUnit.length,
    sourceName,
  };
}

export function applyCalibration(sensors: SensorPoint[], offsets?: CalibrationOffsets): SensorPoint[] {
  if (!offsets) {
    return sensors;
  }
  return sensors.map((sensor) => {
    if (sensor.accelUnit !== offsets.unit) {
      return sensor;
    }
    return {
      ...sensor,
      accelX: sensor.accelX - offsets.x,
      accelY: sensor.accelY - offsets.y,
      accelZ: sensor.accelZ - offsets.z,
    };
  });
}

export function normalizeCalibrationWindow(window: CalibrationWindow = {}): CalibrationWindow {
  const start = finiteOrUndefined(window.startElapsedSeconds);
  const end = finiteOrUndefined(window.endElapsedSeconds);
  if (start === undefined && end === undefined) {
    return {};
  }
  if (start === undefined) {
    return { endElapsedSeconds: end };
  }
  if (end === undefined) {
    return { startElapsedSeconds: start };
  }
  return {
    startElapsedSeconds: Math.min(start, end),
    endElapsedSeconds: Math.max(start, end),
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}
