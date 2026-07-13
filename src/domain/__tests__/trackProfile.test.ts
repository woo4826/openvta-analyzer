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
});

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
