import { describe, expect, it } from "vitest";
import type { SegmentLapRecord } from "../types";
import { buildLapMapLayers } from "../lapMapLayers";

describe("lap map layers", () => {
  it("assigns visible role styles and distinct hidden defaults to other laps", () => {
    const layers = buildLapMapLayers(records(5), "lap-5", "lap-2");

    expect(layers).toHaveLength(5);
    expect(layers.find((layer) => layer.id === "lap-5")).toMatchObject({
      role: "focused",
      visible: true,
      color: "#dc2626",
      lineStyle: "solid",
      opacity: 1,
      width: 4,
    });
    expect(layers.find((layer) => layer.id === "lap-2")).toMatchObject({
      role: "reference",
      visible: true,
      color: "#2563eb",
      lineStyle: "dashed",
      opacity: 0.9,
      width: 3.5,
    });
    const others = layers.filter((layer) => layer.role === "other");
    expect(others.every((layer) => !layer.visible)).toBe(true);
    expect(new Set(others.map((layer) => layer.color)).size).toBe(others.length);
    expect(new Set(others.map((layer) => layer.lineStyle))).toEqual(new Set(["dashed", "dotted"]));
  });

  it("applies editable overrides without mutating the recording records", () => {
    const input = records(3);
    const snapshot = structuredClone(input);
    const layers = buildLapMapLayers(input, "lap-3", "lap-1", {
      "lap-2": { visible: true, color: "#112233", lineStyle: "solid", opacity: 0.27 },
      missing: { visible: true },
    });

    expect(layers.find((layer) => layer.id === "lap-2")).toMatchObject({
      visible: true,
      color: "#112233",
      lineStyle: "solid",
      opacity: 0.27,
      role: "other",
    });
    expect(input).toEqual(snapshot);
  });

  it("drops records without enough trajectory points and clamps invalid opacity overrides", () => {
    const input = records(2);
    input[0].trajectory = input[0].trajectory.slice(0, 1);

    const layers = buildLapMapLayers(input, "lap-2", "lap-1", {
      "lap-2": { opacity: 4 },
    });

    expect(layers.map((layer) => layer.id)).toEqual(["lap-2"]);
    expect(layers[0].opacity).toBe(1);
  });
});

function records(count: number): SegmentLapRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    lapId: `lap-${index + 1}`,
    ordinal: index + 1,
    completion: "complete",
    validity: "valid",
    flags: [],
    fromPartialLap: false,
    coverage: "complete",
    eligibleForBest: true,
    durationSeconds: 10 + index,
    drivenDistanceMeters: 100,
    gpsConfidence: "high",
    trajectory: [0, 1].map((sample) => ({
      sourceIndex: sample,
      distanceMeters: sample * 100,
      elapsedSeconds: sample * 10,
      speedKmh: 80,
      latitude: 38,
      longitude: 128 + sample * 0.001,
      referenceElapsedSeconds: sample * 10,
      deltaSeconds: 0,
      pathDistanceMeters: sample * 100,
      signedOffsetMeters: 0,
    })),
  }));
}
