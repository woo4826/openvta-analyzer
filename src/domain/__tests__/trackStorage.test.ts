import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTrackProfileMemoryForTests,
  deleteTrackProfile,
  listTrackProfiles,
  saveTrackProfile,
  saveTrackProfiles,
} from "../trackStorage";
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

  it("validates a batch before storing any profile", async () => {
    const valid = testProfile();
    const invalid = { ...testProfile(), id: "invalid", centerline: { type: "LineString", coordinates: [] } } as TrackProfileV1;

    await expect(saveTrackProfiles([valid, invalid])).rejects.toThrow(/invalid/i);
    expect(await listTrackProfiles()).toEqual([]);
  });

  it("stores a validated batch together", async () => {
    const first = testProfile();
    const second = { ...testProfile(), id: "second", updatedAt: "2026-07-14T00:00:00.000Z" };

    await saveTrackProfiles([first, second]);

    expect((await listTrackProfiles()).map((profile) => profile.id)).toEqual(["second", "test-track"]);
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
