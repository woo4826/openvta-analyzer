import { beforeEach, describe, expect, it } from "vitest";
import { clearTrackProfileMemoryForTests, deleteTrackProfile, listTrackProfiles, saveTrackProfile } from "../trackStorage";
import type { TrackProfileV1 } from "../types";

describe("track profile storage fallback", () => {
  beforeEach(() => clearTrackProfileMemoryForTests());

  it("remains usable through the in-memory fallback when IndexedDB is unavailable", async () => {
    const profile = testProfile();
    await saveTrackProfile(profile);
    expect(await listTrackProfiles()).toEqual([profile]);
    await deleteTrackProfile(profile.id);
    expect(await listTrackProfiles()).toEqual([]);
  });
});

function testProfile(): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id: "test-track",
    name: "Test Track",
    centerline: { type: "LineString", coordinates: [[0, 0], [0.001, 0]] },
    direction: "unknown",
    sectorGates: [],
    sections: [],
    source: { kind: "user" },
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}
