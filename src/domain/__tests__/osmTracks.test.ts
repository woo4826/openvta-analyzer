import { describe, expect, it, vi } from "vitest";
import { buildOverpassQuery, lookupOsmTracks, parseOsmTrackCandidates } from "../osmTracks";
import { validateTrackProfile } from "../trackProfile";
import type { GpsPoint } from "../types";

describe("OpenStreetMap track lookup", () => {
  it("builds a bounded raceway query without sending the VTA rows", () => {
    const query = buildOverpassQuery([gps(128, 38, 0), gps(128.01, 38.01, 1)]);
    expect(query).toContain('"highway"="raceway"');
    expect(query).toContain("out tags geom");
    expect(query).not.toContain("motorport");
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
    expect(validateTrackProfile(candidates[0].profile)).toEqual({ profile: candidates[0].profile });
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

  it("uses the fallback endpoint when a successful response has a malformed payload", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: "not-an-array" }), { status: 200 }))
      .mockResolvedValueOnce(overpassResponse(squareGeometry()));

    const result = await lookupOsmTracks(squareRecording(), fetchImpl, ["first", "fallback"]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("matched");
    expect(result.endpoint).toBe("fallback");
  });

  it("does not query a fallback after a valid response with no raceway match", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));

    const result = await lookupOsmTracks(squareRecording(), fetchImpl, ["first", "fallback"]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("no-match");
    expect(result.endpoint).toBe("first");
  });

  it.each([
    ["the raceway=pit_lane tag", { highway: "raceway", raceway: "pit_lane", name: "Service road" }],
    ["a localized pit name", { highway: "raceway", name: "인제 피트 레인" }],
  ])("attaches a pit lane identified by %s without ranking it as a circuit", (_label, pitTags) => {
    const pit = pitGeometry();
    const candidates = parseOsmTrackCandidates({
      elements: [
        { type: "way", id: 123, tags: { highway: "raceway", name: "Test Circuit" }, geometry: squareGeometry() },
        { type: "way", id: 456, tags: pitTags, geometry: pit },
      ],
    }, squareRecording());

    expect(candidates).toHaveLength(1);
    expect(candidates[0].profile.id).toBe("osm-123");
    expect(candidates[0].profile.source.osmElementIds).toEqual(["way/123", "way/456"]);
    expect(candidates[0].profile.pitLane?.line?.coordinates).toEqual(pit.map(({ lon, lat }) => [lon, lat]));
  });

  it("orients the OSM centerline, direction, and start gate from the recording direction", () => {
    const reversedGeometry = [...squareGeometry()].reverse();
    const candidates = parseOsmTrackCandidates({
      elements: [
        { type: "way", id: 123, tags: { highway: "raceway", name: "Test Circuit", oneway: "yes" }, geometry: reversedGeometry },
        { type: "node", id: 999, tags: { raceway: "start-finish" }, lon: 0, lat: 0 },
      ],
    }, squareRecording());

    expect(candidates[0].profile.centerline.coordinates.slice(0, 2)).toEqual([[0, 0], [0.002, 0]]);
    expect(candidates[0].profile.direction).toBe("counterclockwise");
    expect(candidates[0].profile.startFinish?.forwardBearingDegrees).toBeCloseTo(90, 2);
  });
});

function overpassResponse(geometry: ReturnType<typeof squareGeometry>) {
  return new Response(JSON.stringify({ elements: [{
    type: "way",
    id: 123,
    tags: { highway: "raceway", name: "Test Circuit" },
    geometry,
  }] }), { status: 200 });
}

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

function pitGeometry() {
  return [
    { lon: -0.0002, lat: 0.0003 },
    { lon: 0.0005, lat: 0.0003 },
    { lon: 0.0012, lat: 0.0003 },
    { lon: 0.0019, lat: 0.0003 },
  ];
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
