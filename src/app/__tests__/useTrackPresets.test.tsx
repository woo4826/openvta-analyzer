import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsPoint, TrackProfileV1 } from "../../domain/types";

const mocks = vi.hoisted(() => ({
  loadHostedTrackPresets: vi.fn(),
  listTrackProfiles: vi.fn(),
  getTrackProfileOrigins: vi.fn(),
  deleteTrackProfile: vi.fn(),
}));

vi.mock("../../domain/trackPresetIndex", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../domain/trackPresetIndex")>(),
  loadHostedTrackPresets: mocks.loadHostedTrackPresets,
}));

vi.mock("../../domain/trackStorage", () => ({
  listTrackProfiles: mocks.listTrackProfiles,
  getTrackProfileOrigins: mocks.getTrackProfileOrigins,
  deleteTrackProfile: mocks.deleteTrackProfile,
}));

import { useTrackPresets } from "../useTrackPresets";

describe("useTrackPresets", () => {
  beforeEach(() => {
    mocks.loadHostedTrackPresets.mockReset().mockResolvedValue([hostedProfile()]);
    mocks.listTrackProfiles.mockReset().mockResolvedValue([]);
    mocks.getTrackProfileOrigins.mockReset().mockResolvedValue({});
    mocks.deleteTrackProfile.mockReset().mockResolvedValue(undefined);
  });

  it("prefers a local override with the same id and resets to the hosted profile", async () => {
    const localOverride = { ...hostedProfile(), name: "My Inje setup", updatedAt: "2026-07-15T01:00:00.000Z" };
    mocks.listTrackProfiles.mockResolvedValueOnce([localOverride]).mockResolvedValueOnce([]);
    mocks.getTrackProfileOrigins.mockResolvedValueOnce({ [localOverride.id]: "local-override" }).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTrackPresets(points()));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.profiles[0]).toMatchObject({ profile: localOverride, origin: "local-override" });

    await act(() => result.current.resetOverride(localOverride.id));

    expect(mocks.deleteTrackProfile).toHaveBeenCalledWith(localOverride.id);
    await waitFor(() => expect(result.current.profiles[0]).toMatchObject({ profile: hostedProfile(), origin: "built-in" }));
  });

  it("deletes an override created after the preset snapshot was loaded", async () => {
    const { result } = renderHook(() => useTrackPresets(points()));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.profiles[0]).toMatchObject({ origin: "built-in" });

    await act(() => result.current.resetOverride(hostedProfile().id));

    expect(mocks.deleteTrackProfile).toHaveBeenCalledWith(hostedProfile().id);
    expect(result.current.profiles[0]).toMatchObject({ origin: "built-in" });
  });

  it("keeps the hosted preset authoritative over same-id non-override cache entries", async () => {
    const staleOsm = { ...hostedProfile(), name: "Old OSM cache", updatedAt: "2025-01-01T00:00:00.000Z" };
    mocks.listTrackProfiles.mockResolvedValue([staleOsm]);
    mocks.getTrackProfileOrigins.mockResolvedValue({ [staleOsm.id]: "osm" });
    const { result } = renderHook(() => useTrackPresets(points()));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.profiles).toContainEqual({ profile: hostedProfile(), origin: "built-in" });
    expect(result.current.profiles).not.toContainEqual(expect.objectContaining({ profile: staleOsm }));
  });

  it("reports hosted failure without discarding local profiles", async () => {
    const imported = { ...hostedProfile(), id: "imported", source: { kind: "user" as const } };
    mocks.loadHostedTrackPresets.mockRejectedValue(new Error("offline"));
    mocks.listTrackProfiles.mockResolvedValue([imported]);
    mocks.getTrackProfileOrigins.mockResolvedValue({ imported: "imported" });
    const { result } = renderHook(() => useTrackPresets(points()));

    await waitFor(() => expect(result.current.status).toBe("hosted-unavailable"));
    expect(result.current.profiles).toEqual([{ profile: imported, origin: "imported" }]);
  });
});

function points(): GpsPoint[] {
  return [{
    index: 0,
    lineNumber: 1,
    rawLine: "",
    date: "20260715",
    time: "000000",
    latitude: 38,
    longitude: 128.29,
    altitudeMeters: 0,
    speedKmh: 100,
    bearingDegrees: 0,
    satelliteCount: 10,
    source: "RawGps",
    confidence: 1,
  }];
}

function hostedProfile(): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id: "kr-inje-speedium-full",
    name: "Inje Speedium",
    centerline: { type: "LineString", coordinates: [[128.28, 38], [128.29, 38.01]] },
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
