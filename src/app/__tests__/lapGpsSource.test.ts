import { describe, expect, it } from "vitest";
import type { GpsPoint, SourceVisibility } from "../../domain/types";
import { lapWorkspaceKey, selectLapGpsSource } from "../lapGpsSource";

describe("selectLapGpsSource", () => {
  it("prefers enhanced GPS when both visible sources are available", () => {
    const rawPoints = [gpsPoint(0, "RawGps")];
    const enhancedPoints = [gpsPoint(0, "EnhancedGps")];

    expect(selectLapGpsSource({ gpsPoints: rawPoints, enhancedPoints }, bothSources())).toEqual({
      key: "enhancedGps",
      points: enhancedPoints,
      visibility: { rawGps: false, enhancedGps: true },
    });
  });

  it("uses an explicitly selected raw source exclusively", () => {
    const rawPoints = [gpsPoint(0, "RawGps")];
    const enhancedPoints = [gpsPoint(0, "EnhancedGps")];

    expect(selectLapGpsSource(
      { gpsPoints: rawPoints, enhancedPoints },
      { rawGps: true, enhancedGps: false },
    )).toEqual({
      key: "rawGps",
      points: rawPoints,
      visibility: { rawGps: true, enhancedGps: false },
    });
  });

  it("uses an explicitly selected enhanced source exclusively", () => {
    const rawPoints = [gpsPoint(0, "RawGps")];
    const enhancedPoints = [gpsPoint(0, "EnhancedGps")];

    expect(selectLapGpsSource(
      { gpsPoints: rawPoints, enhancedPoints },
      { rawGps: false, enhancedGps: true },
    )).toEqual({
      key: "enhancedGps",
      points: enhancedPoints,
      visibility: { rawGps: false, enhancedGps: true },
    });
  });

  it("falls back to the available raw source for legacy files", () => {
    const rawPoints = [gpsPoint(0, "RawGps")];

    expect(selectLapGpsSource(
      { gpsPoints: rawPoints, enhancedPoints: [] },
      { rawGps: false, enhancedGps: true },
    )).toEqual({
      key: "rawGps",
      points: rawPoints,
      visibility: { rawGps: true, enhancedGps: false },
    });
  });

  it("falls back to the available enhanced source when raw is unavailable", () => {
    const enhancedPoints = [gpsPoint(0, "EnhancedGps")];

    expect(selectLapGpsSource(
      { gpsPoints: [], enhancedPoints },
      { rawGps: true, enhancedGps: false },
    )).toEqual({
      key: "enhancedGps",
      points: enhancedPoints,
      visibility: { rawGps: false, enhancedGps: true },
    });
  });

  it("qualifies lap workspace state by the selected source", () => {
    expect(lapWorkspaceKey("file-1", "rawGps")).toBe("file-1::rawGps");
    expect(lapWorkspaceKey("file-1", "enhancedGps")).toBe("file-1::enhancedGps");
    expect(lapWorkspaceKey(undefined, "enhancedGps")).toBeUndefined();
    expect(lapWorkspaceKey("file-1", undefined)).toBeUndefined();
  });
});

function bothSources(): SourceVisibility {
  return { rawGps: true, enhancedGps: true };
}

function gpsPoint(index: number, source: GpsPoint["source"]): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "2026-07-13",
    time: "00:00:00",
    latitude: 37,
    longitude: 127,
    altitudeMeters: 0,
    speedKmh: 60,
    bearingDegrees: 90,
    satelliteCount: 10,
    source,
    confidence: 1,
  };
}
