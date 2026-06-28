import { GRAVITY_MPS2, type CalibrationOffsets, type CalibrationWindow, type SensorPoint } from "./types";

export function estimateCalibrationOffsets(
  sensors: SensorPoint[],
  window: CalibrationWindow = {},
  sourceName?: string,
): CalibrationOffsets | undefined {
  const selected = sensors.filter((sensor) => {
    if (window.startElapsedSeconds !== undefined && sensor.elapsedSeconds < window.startElapsedSeconds) {
      return false;
    }
    if (window.endElapsedSeconds !== undefined && sensor.elapsedSeconds > window.endElapsedSeconds) {
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

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

