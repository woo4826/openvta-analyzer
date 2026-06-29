import type { FilterResult, FilterSettings, SensorPoint } from "./types";

const DEFAULT_CHANNELS = { x: true, y: true, z: true };

export const FILTER_WARNING_CUTOFF_OUT_OF_RANGE = "Filter skipped because the cutoff frequency is outside the valid range.";
export const FILTER_WARNING_IRREGULAR_TIMESTAMPS =
  "Sensor timestamps are irregular; an effective sample rate was estimated for filtering.";

export const defaultFilterSettings: FilterSettings = {
  enabled: false,
  cutoffHz: 5,
  channels: DEFAULT_CHANNELS,
};

export function applyAccelerationFilter(
  sensors: SensorPoint[],
  settings: FilterSettings,
): FilterResult {
  if (!settings.enabled || sensors.length < 6) {
    return { sensors };
  }

  const sample = estimateSampleRateHz(sensors);
  if (!sample.sampleRateHz || settings.cutoffHz <= 0 || settings.cutoffHz >= sample.sampleRateHz / 2) {
    return {
      sensors,
      sampleRateHz: sample.sampleRateHz,
      warning: FILTER_WARNING_CUTOFF_OUT_OF_RANGE,
    };
  }

  const coefficients = butterworthLowPass(settings.cutoffHz, sample.sampleRateHz);
  const x = settings.channels.x ? zeroPhaseFilter(sensors.map((sensor) => sensor.accelX), coefficients) : undefined;
  const y = settings.channels.y ? zeroPhaseFilter(sensors.map((sensor) => sensor.accelY), coefficients) : undefined;
  const z = settings.channels.z ? zeroPhaseFilter(sensors.map((sensor) => sensor.accelZ), coefficients) : undefined;
  const filtered = sensors.map((sensor, index) => ({
    ...sensor,
    accelX: x ? x[index] : sensor.accelX,
    accelY: y ? y[index] : sensor.accelY,
    accelZ: z ? z[index] : sensor.accelZ,
  }));

  return {
    sensors: filtered,
    sampleRateHz: sample.sampleRateHz,
    warning: sample.regular ? undefined : FILTER_WARNING_IRREGULAR_TIMESTAMPS,
  };
}

export function estimateSampleRateHz(sensors: SensorPoint[]): { sampleRateHz?: number; regular: boolean } {
  const deltas: number[] = [];
  for (let index = 1; index < sensors.length; index += 1) {
    const delta = sensors[index].elapsedSeconds - sensors[index - 1].elapsedSeconds;
    if (delta > 0 && Number.isFinite(delta)) {
      deltas.push(delta);
    }
  }
  if (!deltas.length) {
    return { regular: false };
  }
  const medianDelta = median(deltas);
  const regular = deltas.every((delta) => Math.abs(delta - medianDelta) <= medianDelta * 0.2);
  return { sampleRateHz: 1 / medianDelta, regular };
}

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function butterworthLowPass(cutoffHz: number, sampleRateHz: number): BiquadCoefficients {
  const q = Math.SQRT1_2;
  const omega = (2 * Math.PI * cutoffHz) / sampleRateHz;
  const cos = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * q);
  const b0 = (1 - cos) / 2;
  const b1 = 1 - cos;
  const b2 = (1 - cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function zeroPhaseFilter(values: number[], coefficients: BiquadCoefficients): number[] {
  const forward = biquad(values, coefficients);
  return biquad([...forward].reverse(), coefficients).reverse();
}

function biquad(values: number[], c: BiquadCoefficients): number[] {
  const output: number[] = [];
  let x1 = values[0] ?? 0;
  let x2 = x1;
  let y1 = x1;
  let y2 = x1;
  for (const x0 of values) {
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    output.push(y0);
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
