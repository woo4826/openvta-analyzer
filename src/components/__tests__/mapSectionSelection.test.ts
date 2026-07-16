import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import type { TrackSection } from "../../domain/types";
import {
  resolveMapSectionSelection,
  resolveSectionAtDistance,
  sectionMidpointSelection,
} from "../mapSectionSelection";

const line: LineString = {
  type: "LineString",
  coordinates: [[0, 0], [0.001, 0], [0.001, 0.0001], [0, 0.0001]],
};

const sections: TrackSection[] = [
  { id: "out", name: "Out", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 111 },
  { id: "turn", name: "Turn", kind: "corner-right", startDistanceMeters: 111, endDistanceMeters: 122 },
  { id: "return", name: "Return", kind: "straight", startDistanceMeters: 122, endDistanceMeters: 233 },
];

describe("mapSectionSelection", () => {
  it("resolves a close parallel branch from the click coordinate instead of rendered feature order", () => {
    expect(resolveMapSectionSelection([0.00075, 0.0001], line, sections)).toMatchObject({
      sectionId: "return",
      distanceMeters: expect.any(Number),
      offsetMeters: expect.any(Number),
      coordinate: [0.00075, 0.0001],
    });
  });

  it("gives an exact boundary to the section beginning there", () => {
    expect(resolveSectionAtDistance(111, sections)?.id).toBe("turn");
    expect(resolveSectionAtDistance(122, sections)?.id).toBe("return");
  });

  it("chooses the closest section for gaps and distances beyond the declared ranges", () => {
    const gapped: TrackSection[] = [
      { id: "first", name: "First", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 80 },
      { id: "second", name: "Second", kind: "straight", startDistanceMeters: 100, endDistanceMeters: 150 },
    ];

    expect(resolveSectionAtDistance(94, gapped)?.id).toBe("second");
    expect(resolveSectionAtDistance(240, sections)?.id).toBe("return");
  });

  it("returns midpoint metadata for coordinate-fallback interaction", () => {
    expect(sectionMidpointSelection(sections[0])).toEqual({ sectionId: "out", distanceMeters: 55.5 });
  });

  it("rejects invalid coordinates and empty centerlines", () => {
    expect(resolveMapSectionSelection([Number.NaN, 0], line, sections)).toBeUndefined();
    expect(resolveMapSectionSelection(
      [0, 0],
      { type: "LineString", coordinates: [] },
      sections,
    )).toBeUndefined();
  });
});
