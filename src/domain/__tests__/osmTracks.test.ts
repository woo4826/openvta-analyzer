import { describe, expect, it, vi } from "vitest";
import { buildOverpassQuery, lookupOsmTracks, parseOsmTrackCandidates } from "../osmTracks";
import type { GpsPoint } from "../types";

describe("OpenStreetMap track lookup", () => {
  it("builds a bounded raceway query without sending the VTA rows", () => {
    const query = buildOverpassQuery([gps(128, 38, 0), gps(128.01, 38.01, 1)]);
    expect(query).toContain('"highway"="raceway"');
    expect(query).toContain("out tags geom");
    expect(query).not.toContain("RawGps");
  });

  it("converts raceway geometry into a scored ODbL track profile", () => {
    const points = squareRecording();
    const candidates = parseOsmTrackCandidates({
      elements: [{
        type: "way",
        id: 123,
        tags: { highway: "raceway", name: "Test Circuit" },
        geometry: squareGeometry(),
      }],
    }, points);
    expect(candidates[0].profile).toMatchObject({
      id: "osm-123",
      name: "Test Circuit",
      source: { kind: "osm", license: "ODbL-1.0" },
    });
    expect(candidates[0].medianDistanceMeters).toBeLessThan(1);
  });

  it("uses one fallback endpoint after a failed Overpass request", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [{
        type: "way",
        id: 123,
        tags: { highway: "raceway", name: "Test Circuit" },
        geometry: squareGeometry(),
      }] }), { status: 200 }));
    const result = await lookupOsmTracks(squareRecording(), fetchImpl, ["first", "fallback"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("matched");
    expect(result.endpoint).toBe("fallback");
  });
});

function squareGeometry() {
  return [
    { lon: 0, lat: 0 },
    { lon: 0.002, lat: 0 },
    { lon: 0.002, lat: 0.002 },
    { lon: 0, lat: 0.002 },
    { lon: 0, lat: 0 },
  ];
}

function squareRecording(): GpsPoint[] {
  return squareGeometry().map((coordinate, index) => gps(coordinate.lon, coordinate.lat, index));
}

function gps(longitude: number, latitude: number, seconds: number): GpsPoint {
  return {
    index: seconds,
    lineNumber: seconds + 1,
    rawLine: "",
    date: "01012026",
    time: "000000",
    latitude,
    longitude,
    altitudeMeters: 0,
    speedKmh: 80,
    bearingDegrees: 0,
    satelliteCount: 10,
    elapsedRealtimeNanos: seconds * 1_000_000_000,
    source: "RawGps",
    confidence: 1,
  };
}
