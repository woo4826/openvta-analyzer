import { describe, expect, it } from "vitest";
import { exportTrackCatalog, parseTrackBundle } from "../trackCatalog";
import { exportTrackProfile } from "../trackProfile";
import type { TrackProfileV1 } from "../types";

describe("track profile catalog", () => {
  it("imports a single profile or a catalog", () => {
    expect(parseTrackBundle(exportTrackProfile(profile("inje"))).profiles).toHaveLength(1);
    expect(parseTrackBundle(exportTrackCatalog([profile("inje"), profile("taebaek")])).profiles).toHaveLength(2);
  });

  it("rejects duplicate ids atomically", () => {
    const result = parseTrackBundle(exportTrackCatalog([profile("inje"), profile("inje")]));

    expect(result.profiles).toBeUndefined();
    expect(result.error).toMatch(/duplicate/i);
  });

  it("rejects the whole catalog when one profile is invalid", () => {
    const catalog = JSON.stringify({
      schemaVersion: 1,
      kind: "openvta-track-catalog",
      tracks: [profile("inje"), { ...profile("invalid"), centerline: { type: "LineString", coordinates: [] } }],
    });

    const result = parseTrackBundle(catalog);
    expect(result.profiles).toBeUndefined();
    expect(result.error).toMatch(/invalid profile/i);
  });
});

function profile(id: string): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id,
    name: id,
    centerline: { type: "LineString", coordinates: [[0, 0], [0.001, 0]] },
    direction: "unknown",
    sectorGates: [],
    sections: [],
    source: { kind: "user" },
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}
