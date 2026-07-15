import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GpsPoint, TrackProfileV1 } from "../types";
import { routeDistanceMeters } from "../geometry";
import { validateTrackProfile } from "../trackProfile";
import {
  candidateTrackPresets,
  loadHostedTrackPresets,
  parseTrackPresetIndex,
  resolveTrackPresetUrl,
} from "../trackPresetIndex";

const validIndex = {
  schemaVersion: 1,
  kind: "openvta-track-index",
  generatedAt: "2026-07-15T00:00:00.000Z",
  entries: [{
    id: "kr-inje-speedium-full",
    venueName: "Inje Speedium",
    layoutName: "Full Course",
    href: "profiles/inje-speedium-full.2026-07-15.json",
    bbox: [128.27, 37.99, 128.3, 38.01],
    lengthMeters: 3915,
    direction: "clockwise",
    revision: "2026-07-15",
    quality: "curated",
  }],
};

describe("hosted track preset index", () => {
  it("resolves profile URLs under the GitHub Pages base path", () => {
    const index = parseTrackPresetIndex(validIndex);
    expect(resolveTrackPresetUrl("/openvta-analyzer/", index.entries[0].href))
      .toBe("/openvta-analyzer/tracks/profiles/inje-speedium-full.2026-07-15.json");
  });

  it("filters the index before profile fetches", () => {
    const index = parseTrackPresetIndex(validIndex);
    expect(candidateTrackPresets(index.entries, injePoints()))
      .toEqual([expect.objectContaining({ id: "kr-inje-speedium-full" })]);
    expect(candidateTrackPresets(index.entries, distantPoints())).toEqual([]);
  });

  it.each([
    { ...validIndex, schemaVersion: 2 },
    { ...validIndex, entries: [validIndex.entries[0], validIndex.entries[0]] },
    { ...validIndex, entries: [{ ...validIndex.entries[0], href: "../private.json" }] },
    { ...validIndex, entries: [{ ...validIndex.entries[0], href: "https://example.com/profile.json" }] },
    { ...validIndex, entries: [{ ...validIndex.entries[0], bbox: [128.3, 37.99, 128.27, 38.01] }] },
  ])("rejects unsupported, duplicate, unsafe, or invalid entries", (value) => {
    expect(() => parseTrackPresetIndex(value)).toThrow();
  });

  it("fetches only matching candidates and skips a malformed profile", async () => {
    const second = {
      ...validIndex.entries[0],
      id: "kr-inje-speedium-short",
      href: "profiles/short.json",
      layoutName: "Short",
    };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ...validIndex, entries: [...validIndex.entries, second] }))
      .mockResolvedValueOnce(jsonResponse(profile()))
      .mockResolvedValueOnce(jsonResponse({ nope: true }));

    await expect(loadHostedTrackPresets(injePoints(), "/openvta-analyzer/", request))
      .resolves.toEqual([profile()]);
    expect(request).toHaveBeenNthCalledWith(1, "/openvta-analyzer/tracks/index.v1.json", expect.any(Object));
    expect(request).toHaveBeenNthCalledWith(2, "/openvta-analyzer/tracks/profiles/inje-speedium-full.2026-07-15.json", expect.any(Object));
  });

  it("ships a valid attributed Inje profile with a complete editable section partition", () => {
    const index = parseTrackPresetIndex(JSON.parse(fs.readFileSync("public/tracks/index.v1.json", "utf8")));
    const value = JSON.parse(fs.readFileSync("public/tracks/profiles/inje-speedium-full.2026-07-15.json", "utf8"));
    const parsed = validateTrackProfile(value);

    expect(parsed.error).toBeUndefined();
    expect(parsed.profile?.id).toBe(index.entries[0].id);
    expect(parsed.profile?.source).toMatchObject({
      attribution: expect.stringMatching(/OpenStreetMap contributors/i),
      license: "ODbL-1.0",
      osmElementIds: ["way/651693293"],
    });
    const sections = parsed.profile!.sections;
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
    expect(sections[0].startDistanceMeters).toBe(0);
    sections.slice(1).forEach((section, index) => {
      expect(section.startDistanceMeters).toBe(sections[index].endDistanceMeters);
    });
    expect(Math.abs(sections.at(-1)!.endDistanceMeters - routeDistanceMeters(parsed.profile!.centerline.coordinates)))
      .toBeLessThan(1);
    expect(sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "inje-c6", name: "Corner 6", startDistanceMeters: 1702.5 }),
      expect.objectContaining({ id: "inje-s12", name: "Straight 12" }),
    ]));
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function injePoints(): GpsPoint[] {
  return [gps(128.285, 37.996), gps(128.295, 38.006)];
}

function distantPoints(): GpsPoint[] {
  return [gps(127, 37), gps(127.01, 37.01)];
}

function gps(longitude: number, latitude: number): GpsPoint {
  return {
    index: 0,
    lineNumber: 1,
    rawLine: "",
    date: "20260715",
    time: "000000",
    latitude,
    longitude,
    altitudeMeters: 0,
    speedKmh: 100,
    bearingDegrees: 0,
    satelliteCount: 10,
    source: "RawGps",
    confidence: 1,
  };
}

function profile(): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id: "kr-inje-speedium-full",
    name: "Inje Speedium",
    layoutName: "Full Course",
    centerline: { type: "LineString", coordinates: [[128.285, 37.996], [128.295, 38.006]] },
    direction: "clockwise",
    sectorGates: [],
    sections: [],
    source: {
      kind: "osm",
      osmElementIds: ["way/651693293"],
      fetchedAt: "2026-07-15T00:00:00.000Z",
      attribution: "© OpenStreetMap contributors",
      license: "ODbL-1.0",
    },
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}
