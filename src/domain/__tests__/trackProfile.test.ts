import { describe, expect, it } from "vitest";
import type { TrackProfileV1 } from "../types";
import { exportTrackProfile, parseTrackProfile, validateTrackProfile } from "../trackProfile";

describe("track profile schema", () => {
  it("round trips a valid version 1 profile", () => {
    const profile = validProfile();
    const result = parseTrackProfile(exportTrackProfile(profile));
    expect(result).toEqual({ profile });
  });

  it("rejects unsupported versions and invalid coordinates", () => {
    expect(validateTrackProfile({ ...validProfile(), schemaVersion: 2 }).error).toMatch(/schemaVersion/);
    expect(
      validateTrackProfile({
        ...validProfile(),
        centerline: { type: "LineString", coordinates: [[181, 0], [0, 0]] },
      }).error,
    ).toMatch(/centerline/);
  });

  it("requires attribution and ODbL metadata for OSM profiles", () => {
    expect(
      validateTrackProfile({
        ...validProfile(),
        source: { kind: "osm" },
      }).error,
    ).toMatch(/source/);
  });

  it("requires valid element ids, fetch time, attribution, and ODbL for OSM profiles", () => {
    const profile = validOsmProfile();
    expect(validateTrackProfile(profile)).toEqual({ profile });
    const offsetProfile = {
      ...profile,
      source: { ...profile.source, fetchedAt: "2026-07-13T09:00:00+09:00" },
    };
    expect(validateTrackProfile(offsetProfile)).toEqual({ profile: offsetProfile });

    for (const source of [
      { ...profile.source, osmElementIds: [] },
      { ...profile.source, osmElementIds: ["way/not-a-number"] },
      { ...profile.source, fetchedAt: "not-a-date" },
      { ...profile.source, attribution: "" },
      { ...profile.source, attribution: "Some map provider" },
      { ...profile.source, license: undefined },
    ]) {
      expect(validateTrackProfile({ ...profile, source }).error).toMatch(/source/);
    }
  });

  it("rejects a section whose end precedes its start", () => {
    expect(validateTrackProfile({
      ...validProfile(),
      sections: [{
        id: "reversed",
        name: "Reversed section",
        kind: "straight",
        startDistanceMeters: 50,
        endDistanceMeters: 10,
      }],
    }).error).toMatch(/section/);
  });

  it("enforces contextual gate kinds and unique gate ids", () => {
    const profile = validProfile();
    expect(validateTrackProfile({
      ...profile,
      startFinish: { ...profile.startFinish!, kind: "pit-in" },
    }).error).toMatch(/startFinish/);
    expect(validateTrackProfile({
      ...profile,
      sectorGates: [{ ...profile.startFinish!, id: "sector-1", kind: "start-finish" }],
    }).error).toMatch(/sector/);
    expect(validateTrackProfile({
      ...profile,
      pitLane: { inGate: { ...profile.startFinish!, id: "pit-in", kind: "sector" } },
    }).error).toMatch(/pitLane/);
    expect(validateTrackProfile({
      ...profile,
      sectorGates: [{ ...profile.startFinish!, kind: "sector" }],
    }).error).toMatch(/unique/);
  });

  it("round trips an analysis line and automatic section metadata", () => {
    const profile = {
      ...validProfile(),
      analysisLine: {
        type: "LineString" as const,
        coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]],
      },
      sections: [{
        id: "auto-straight-0-100",
        name: "Straight 1",
        kind: "straight" as const,
        startDistanceMeters: 0,
        endDistanceMeters: 100,
        source: "automatic" as const,
        confidence: 0.82,
      }],
    };

    expect(parseTrackProfile(exportTrackProfile(profile)).profile).toEqual(profile);
  });

  it("rejects automatic-section confidence outside zero through one", () => {
    expect(validateTrackProfile({
      ...validProfile(),
      sections: [{
        id: "invalid-confidence",
        name: "Invalid confidence",
        kind: "straight",
        startDistanceMeters: 0,
        endDistanceMeters: 50,
        source: "automatic",
        confidence: 1.1,
      }],
    }).error).toMatch(/section/);
  });
});

function validOsmProfile(): TrackProfileV1 {
  const profile = validProfile();
  return {
    ...profile,
    source: {
      kind: "osm",
      osmElementIds: ["way/123"],
      fetchedAt: "2026-07-13T00:00:00.000Z",
      attribution: "© OpenStreetMap contributors",
      license: "ODbL-1.0",
    },
  };
}

function validProfile(): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id: "test-track",
    name: "Test Track",
    centerline: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0],
      ],
    },
    direction: "clockwise",
    startFinish: {
      id: "start-finish",
      name: "Start / Finish",
      kind: "start-finish",
      line: { type: "LineString", coordinates: [[0, -0.0002], [0, 0.0002]] },
      forwardBearingDegrees: 90,
      widthMeters: 50,
    },
    sectorGates: [],
    sections: [
      {
        id: "corner-1",
        name: "T1",
        kind: "corner-left",
        startDistanceMeters: 10,
        endDistanceMeters: 50,
      },
    ],
    source: { kind: "user" },
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}
