import { describe, expect, it } from "vitest";
import { parseVtaText } from "../parser";
import {
  buildValidationRows,
  displayGpsPointsWithSources,
  normalizeSegment,
  routeDistanceSeries,
  summarizeAxisAlignedRegion,
  summarizeSegment,
} from "../analysis";
import type { GpsPoint } from "../types";

describe("analysis helpers", () => {
  const trace = parseVtaText(
    "analysis.Vta",
    [
      "$17062026,152220,-33.875000000,151.225000000,10,0,0,8",
      "$17062026,152221,-33.874900000,151.225100000,11,36,0,8",
      "@17062026,152221,-33.874880000,151.225120000,11,38,0,8,4.2,gps,1,ImuHeading,0.9,preset,1",
      "$17062026,152222,-33.874800000,151.225200000,12,72,0,8",
      "#0,0.000,0,0,0,0,0.1,0.2,9.7",
      "#1,1.000,0,0,0,0,0.2,0.3,9.8",
      "#2,2.000,0,0,0,0,0.3,0.4,9.9",
    ].join("\n"),
  );

  it("filters raw and enhanced sources independently", () => {
    expect(displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false })).toHaveLength(3);
    expect(displayGpsPointsWithSources(trace, { rawGps: false, enhancedGps: true })).toHaveLength(1);
  });

  it("normalizes reversed segment indexes and summarizes selected rows", () => {
    const segment = normalizeSegment({ startIndex: 2, endIndex: 0, source: "manual" }, 3);
    const summary = summarizeSegment(trace, trace.sensorPoints, segment, { rawGps: true, enhancedGps: false });
    expect(segment).toEqual({ startIndex: 0, endIndex: 2, source: "manual" });
    expect(summary.pointCount).toBe(3);
    expect(summary.sensorCount).toBe(3);
    expect(summary.maxSpeedKmh).toBe(72);
    expect(summary.distanceKm).toBeGreaterThan(0);
  });

  it("builds distance and velocity-derived acceleration rows", () => {
    expect(routeDistanceSeries(displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false }))[2].distanceKm).toBeGreaterThan(0);
    const validation = buildValidationRows(displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false }));
    expect(validation).toHaveLength(2);
    expect(validation[1].derivedAccelMps2).toBeGreaterThan(0);
  });

  it("uses sub-second elapsed realtime deltas for validation acceleration before coarse epoch milliseconds", () => {
    const validation = buildValidationRows([
      gpsPoint({ index: 0, speedKmh: 0, epochMillis: 1_700_000_000_000, elapsedRealtimeNanos: 10_000_000_000 }),
      gpsPoint({ index: 1, speedKmh: 36, epochMillis: 1_700_000_000_000, elapsedRealtimeNanos: 10_500_000_000 }),
    ]);

    expect(validation[0].elapsedSeconds).toBe(0.5);
    expect(validation[0].derivedAccelMps2).toBeCloseTo(20);
  });

  it("summarizes points inside an axis-aligned map region", () => {
    const points = displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false });
    const summary = summarizeAxisAlignedRegion(points, {
      minLatitude: -33.8751,
      maxLatitude: -33.87475,
      minLongitude: 151.2249,
      maxLongitude: 151.22525,
    });
    expect(summary.pointCount).toBe(3);
    expect(summary.maxSpeedKmh).toBe(72);
  });

  it("does not bridge region distance across outside points", () => {
    const summary = summarizeAxisAlignedRegion(
      [
        gpsPoint({ index: 0, latitude: 0, longitude: 0 }),
        gpsPoint({ index: 1, latitude: 0, longitude: 1 }),
        gpsPoint({ index: 2, latitude: 0, longitude: 0.01 }),
      ],
      {
        minLatitude: -0.1,
        maxLatitude: 0.1,
        minLongitude: -0.1,
        maxLongitude: 0.1,
      },
    );

    expect(summary.pointCount).toBe(2);
    expect(summary.distanceKm).toBe(0);
  });
});

function gpsPoint(overrides: Partial<GpsPoint>): GpsPoint {
  return {
    index: 0,
    lineNumber: 1,
    rawLine: "",
    date: "01012026",
    time: "000000",
    latitude: 0,
    longitude: 0,
    altitudeMeters: 0,
    speedKmh: 0,
    bearingDegrees: 0,
    satelliteCount: 0,
    source: "RawGps",
    confidence: 1,
    ...overrides,
  };
}
