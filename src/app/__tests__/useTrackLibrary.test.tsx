import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { exportTrackCatalog } from "../../domain/trackCatalog";
import { exportTrackProfile } from "../../domain/trackProfile";
import { clearTrackProfileMemoryForTests } from "../../domain/trackStorage";
import type { TrackProfileV1 } from "../../domain/types";
import { useTrackLibrary } from "../useTrackLibrary";

describe("track library hook", () => {
  beforeEach(() => clearTrackProfileMemoryForTests());

  it("refreshes after multi-file import and delete", async () => {
    const { result } = renderHook(() => useTrackLibrary());
    await waitFor(() => expect(result.current.busy).toBe(false));

    await act(() => result.current.importTexts([
      exportTrackProfile(profile("inje")),
      exportTrackCatalog([profile("taebaek")]),
    ]));

    expect(result.current.profiles.map((item) => item.id)).toEqual(["inje", "taebaek"]);
    await act(() => result.current.remove("inje"));
    expect(result.current.profiles.map((item) => item.id)).toEqual(["taebaek"]);
  });

  it("does not alter the library when any imported file is invalid", async () => {
    const { result } = renderHook(() => useTrackLibrary());
    await waitFor(() => expect(result.current.busy).toBe(false));
    await act(() => result.current.importTexts([exportTrackProfile(profile("inje"))]));

    await act(() => result.current.importTexts([
      exportTrackProfile(profile("taebaek")),
      "{not-json",
    ]));

    expect(result.current.profiles.map((item) => item.id)).toEqual(["inje"]);
    expect(result.current.error).toBeTruthy();
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
