import { describe, expect, it } from "vitest";
import type { EChartsOption } from "echarts";
import type { SynchronizedAccelerationSeries } from "../../domain/types";
import {
  accelerationVectorScale,
  accelerationVectorSnapshot,
  buildAcceleration3dOption,
  buildAccelerationGgOption,
  type AccelerationVectorLabels,
} from "../accelerationVectorOptions";

describe("acceleration vector options", () => {
  it("finds the nearest focused/reference samples and keeps a bounded preceding trail", () => {
    const focused = series([0, 25, 50, 75, 100]);
    const reference = series([0, 24, 48, 72, 96]);

    const snapshot = accelerationVectorSnapshot(focused, reference, 51, 2);

    expect(snapshot.focused?.distanceMeters).toBe(50);
    expect(snapshot.reference?.distanceMeters).toBe(48);
    expect(snapshot.focusedTrail.map((sample) => sample.distanceMeters)).toEqual([25, 50]);
    expect(accelerationVectorScale(snapshot)).toBe(1.5);
  });

  it("caps the local trail and rounds the symmetric scale up to 0.5 G", () => {
    const focused = series(Array.from({ length: 80 }, (_, index) => index), (distance) => ({
      x: distance === 79 ? 1.72 : distance / 100,
      y: distance === 78 ? -1.61 : -distance / 200,
      z: 1,
    }));

    const snapshot = accelerationVectorSnapshot(focused, undefined, 79);

    expect(snapshot.focusedTrail).toHaveLength(25);
    expect(snapshot.focusedTrail[0].distanceMeters).toBe(55);
    expect(accelerationVectorScale(snapshot)).toBe(2);
  });

  it("builds a 2D G-G diagram with rings, trail, vectors, and distinct lap markers", () => {
    const snapshot = accelerationVectorSnapshot(series([0, 25, 50]), series([0, 24, 48]), 50);
    const option = buildAccelerationGgOption(snapshot, labels()) as EChartsOption & {
      xAxis: { min: number; max: number };
      yAxis: { min: number; max: number };
      series: Array<{ id?: string; symbol?: string; data?: unknown[] }>;
    };

    expect(option.xAxis).toMatchObject({ min: -1.5, max: 1.5 });
    expect(option.yAxis).toMatchObject({ min: -1.5, max: 1.5 });
    expect(option.series.map((item) => item.id)).toEqual(expect.arrayContaining([
      "ring-0.5", "ring-1", "ring-1.5", "focused-trail", "focused-vector",
      "reference-vector", "focused-point", "reference-point",
    ]));
    expect(option.series.find((item) => item.id === "focused-point")?.symbol).toBe("circle");
    expect(option.series.find((item) => item.id === "reference-point")?.symbol).toBe("diamond");
  });

  it("builds a 3D unit sphere and cursor vectors on equal device-axis ranges", () => {
    const snapshot = accelerationVectorSnapshot(series([0, 25, 50]), series([0, 24, 48]), 50);
    const option = buildAcceleration3dOption(snapshot, labels()) as EChartsOption & {
      xAxis3D: { min: number; max: number };
      yAxis3D: { min: number; max: number };
      zAxis3D: { min: number; max: number };
      series: Array<{ id?: string; type?: string }>;
    };

    expect(option.xAxis3D).toMatchObject({ min: -1.5, max: 1.5 });
    expect(option.yAxis3D).toMatchObject({ min: -1.5, max: 1.5 });
    expect(option.zAxis3D).toMatchObject({ min: -1.5, max: 1.5 });
    expect(option.series.map((item) => item.id)).toEqual(expect.arrayContaining([
      "unit-sphere", "focused-trail-3d", "focused-vector-3d", "reference-vector-3d",
      "focused-point-3d", "reference-point-3d",
    ]));
    expect(option.series.find((item) => item.id === "unit-sphere")?.type).toBe("surface");
  });

  it("omits reference-only series when the reference has no synchronized sample", () => {
    const snapshot = accelerationVectorSnapshot(series([0, 25, 50]), undefined, 50);

    const option2d = buildAccelerationGgOption(snapshot, labels()) as { series: Array<{ id?: string }> };
    const option3d = buildAcceleration3dOption(snapshot, labels()) as { series: Array<{ id?: string }> };

    expect(option2d.series.map((item) => item.id)).not.toContain("reference-point");
    expect(option2d.series.map((item) => item.id)).not.toContain("reference-vector");
    expect(option3d.series.map((item) => item.id)).not.toContain("reference-point-3d");
    expect(option3d.series.map((item) => item.id)).not.toContain("reference-vector-3d");
  });
});

function series(
  distances: number[],
  values: (distance: number, index: number) => { x: number; y: number; z: number } = (distance) => ({
    x: distance / 100,
    y: -distance / 200,
    z: 1 + distance / 1000,
  }),
): SynchronizedAccelerationSeries {
  return {
    method: "sensor-clock",
    samples: distances.map((distance, index) => {
      const value = values(distance, index);
      return {
        sensorIndex: index,
        sourceIndex: index + 100,
        distanceMeters: distance,
        elapsedSeconds: distance / 25,
        accelXG: value.x,
        accelYG: value.y,
        accelZG: value.z,
      };
    }),
  };
}

function labels(): AccelerationVectorLabels {
  return {
    deviceX: "Device X",
    deviceY: "Device Y",
    deviceZ: "Device Z",
    focusedLap: "Focused lap",
    referenceLap: "Reference lap",
    localTrail: "Local trail",
  };
}
