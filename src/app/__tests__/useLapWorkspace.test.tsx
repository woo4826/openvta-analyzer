import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OsmTrackCandidate } from "../../domain/osmTracks";
import type { GpsPoint, TrackProfileV1 } from "../../domain/types";
import { createGateFromRoutePoint } from "../../domain/lapDetection";
import { exportTrackProfile } from "../../domain/trackProfile";

const mocks = vi.hoisted(() => ({
  listTrackProfiles: vi.fn(),
  lookupOsmTracks: vi.fn(),
  scoreTrackProfile: vi.fn(),
  saveTrackProfile: vi.fn(),
}));

vi.mock("../../domain/osmTracks", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../domain/osmTracks")>(),
  lookupOsmTracks: mocks.lookupOsmTracks,
  scoreTrackProfile: mocks.scoreTrackProfile,
}));

vi.mock("../../domain/trackStorage", () => ({
  listTrackProfiles: mocks.listTrackProfiles,
  saveTrackProfile: mocks.saveTrackProfile,
}));

import { useLapWorkspace } from "../useLapWorkspace";

describe("useLapWorkspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.listTrackProfiles.mockReset().mockResolvedValue([]);
    mocks.lookupOsmTracks.mockReset();
    mocks.scoreTrackProfile.mockReset().mockImplementation((profile: TrackProfileV1) => ({
      profile,
      medianDistanceMeters: Number.POSITIVE_INFINITY,
      lengthRatio: 0,
      score: Number.POSITIVE_INFINITY,
    }));
    mocks.saveTrackProfile.mockReset().mockResolvedValue(undefined);
  });

  it("does not propose sections from an OSM centerline when no valid complete lap exists", async () => {
    const candidate = osmCandidate();
    mocks.lookupOsmTracks.mockResolvedValue({ status: "ambiguous", candidates: [candidate] });
    const points = [gpsPoint(0, 37, 127), gpsPoint(1, 37, 127.001)];
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    await waitFor(() => expect(result.current.lookupState).toBe("ambiguous"));

    act(() => result.current.chooseCandidate(candidate.profile.id));

    await waitFor(() => expect(result.current.profile).toBeDefined());
    expect(result.current.canProposeSections).toBe(false);
    act(() => result.current.proposeSections());
    expect(result.current.profile?.sections).toEqual([]);
    expect(mocks.saveTrackProfile).toHaveBeenCalledTimes(1);
    expect(mocks.saveTrackProfile.mock.calls[0][0]).toBe(result.current.profile);
  });

  it("requires a choice when two cached layouts score similarly", async () => {
    const first = { ...osmCandidate().profile, id: "cached-a", name: "Layout A", source: { kind: "user" as const } };
    const second = { ...osmCandidate().profile, id: "cached-b", name: "Layout B", source: { kind: "user" as const } };
    mocks.listTrackProfiles.mockResolvedValue([first, second]);
    mocks.scoreTrackProfile.mockImplementation((profile: TrackProfileV1) => ({
      profile,
      medianDistanceMeters: profile.id === "cached-a" ? 5 : 5.5,
      lengthRatio: 1,
      score: profile.id === "cached-a" ? 5 : 5.5,
    }));
    const points = multiLapPoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    await waitFor(() => expect(mocks.listTrackProfiles).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.scoreTrackProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.lookupState).toBe("ambiguous"));

    expect(result.current.profile).toBeUndefined();
    expect(result.current.candidates.map((candidate) => candidate.profile.id)).toEqual(["cached-a", "cached-b"]);
    expect(mocks.lookupOsmTracks).not.toHaveBeenCalled();
  });

  it("proposes sections from the fastest valid complete lap rather than the OSM centerline", async () => {
    const candidate = osmCandidate();
    mocks.lookupOsmTracks.mockResolvedValue({ status: "ambiguous", candidates: [candidate] });
    const points = multiLapPoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    await waitFor(() => expect(result.current.lookupState).toBe("ambiguous"));
    act(() => result.current.chooseCandidate(candidate.profile.id));
    act(() => result.current.useSelectedPointAsStartFinish(0));
    await waitFor(() => expect(result.current.canProposeSections).toBe(true));

    act(() => result.current.proposeSections());

    await waitFor(() => expect(result.current.profile?.sections.some((section) => section.kind !== "straight")).toBe(true));
    expect(result.current.sectionCenterline?.coordinates[0]).toEqual([points[6].longitude, points[6].latitude]);
    expect(result.current.sectionCenterline?.coordinates.length).toBeGreaterThan(20);
  });

  it("automatically seeds analysis sectors from the first valid complete lap", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = multiLapPoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    act(() => result.current.useSelectedPointAsStartFinish(0));

    await waitFor(() => expect(result.current.profile?.analysisLine?.coordinates.length).toBeGreaterThan(20));
    expect(result.current.profile?.sections.length).toBeGreaterThan(0);
    expect(result.current.profile?.sections.every((section) => section.source === "automatic")).toBe(true);
    expect(result.current.sectionResults.length).toBeGreaterThan(result.current.profile!.sections.length);
    expect(result.current.automaticTheoreticalBestSeconds).toBeGreaterThan(0);
  });

  it("preserves edited sections unless automatic replacement is explicit", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = multiLapPoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));
    act(() => result.current.useSelectedPointAsStartFinish(0));
    await waitFor(() => expect(result.current.profile?.sections.length).toBeGreaterThan(0));
    const sectionId = result.current.profile!.sections[0].id;

    act(() => result.current.updateSection(sectionId, { name: "Driver edit", startDistanceMeters: 999_999 }));
    await waitFor(() => expect(result.current.profile?.sections[0].name).toBe("Driver edit"));
    expect(result.current.profile?.sections[0]).toMatchObject({ source: "user", confidence: undefined });
    expect(result.current.profile!.sections[0].startDistanceMeters)
      .toBeLessThan(result.current.profile!.sections[0].endDistanceMeters);

    act(() => result.current.recalculateAutomaticSections(false));
    expect(result.current.profile?.sections[0].name).toBe("Driver edit");
    act(() => result.current.recalculateAutomaticSections(true));
    await waitFor(() => expect(result.current.profile?.sections[0].source).toBe("automatic"));
  });

  it("saves a recording profile using the fastest valid complete lap instead of the repeated session", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = multiLapPoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    act(() => result.current.useSelectedPointAsStartFinish(0));
    await waitFor(() => expect(result.current.detection?.laps.filter((lap) => lap.completion === "complete")).toHaveLength(2));

    let saved: TrackProfileV1 | undefined;
    await act(async () => {
      saved = await result.current.saveCurrentProfile();
    });

    expect(saved?.centerline.coordinates[0]).toEqual([points[6].longitude, points[6].latitude]);
    expect(saved?.centerline.coordinates.at(-1)).toEqual([points[11].longitude, points[11].latitude]);
    expect(saved?.centerline.coordinates.length).toBeGreaterThan(points.slice(6, 12).length);
    expect(saved?.centerline.coordinates.length).toBeLessThan(points.length * 10);
  });

  it("creates editable section proposals directly from a manual trackless lap", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = multiLapPoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    act(() => result.current.useSelectedPointAsStartFinish(0));
    await waitFor(() => expect(result.current.canProposeSections).toBe(true));

    await waitFor(() => {
      expect(result.current.profile?.source.kind).toBe("recording");
      expect(result.current.profile?.sections.some((section) => section.kind !== "straight")).toBe(true);
    });
  });

  it("accepts only valid complete reference laps and resets a reference that becomes invalid", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = multiLapPoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    act(() => result.current.useSelectedPointAsStartFinish(0));
    await waitFor(() => expect(result.current.detection?.laps.filter((lap) => lap.completion === "complete")).toHaveLength(2));
    const complete = result.current.detection!.laps.filter((lap) => lap.completion === "complete");
    const partial = result.current.detection!.laps.find((lap) => lap.completion !== "complete")!;
    const initialReference = result.current.referenceLapId;

    act(() => result.current.setReferenceLap(partial.id));
    expect(result.current.referenceLapId).toBe(initialReference);

    const alternate = complete.find((lap) => lap.id !== initialReference)!;
    act(() => result.current.setReferenceLap(alternate.id));
    await waitFor(() => expect(result.current.referenceLapId).toBe(alternate.id));

    act(() => result.current.setLapValidity(alternate.id, "invalid"));
    await waitFor(() => {
      expect(result.current.referenceLapId).not.toBe(alternate.id);
      const reference = result.current.detection?.laps.find((lap) => lap.id === result.current.referenceLapId);
      expect(reference).toMatchObject({ completion: "complete", validity: "valid" });
    });
  });

  it("clears boundary and validity overrides when start/finish dimensions change", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = routePoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    act(() => result.current.useSelectedPointAsStartFinish(1));
    await waitFor(() => expect(result.current.detection?.laps.length).toBeGreaterThan(0));

    const lapId = result.current.detection!.laps[0].id;
    act(() => {
      result.current.addBoundary(3);
      result.current.setLapValidity(lapId, "excluded");
    });
    await waitFor(() => {
      expect(result.current.detection?.boundaries.some((boundary) => boundary.source === "manual")).toBe(true);
      expect(result.current.detection?.laps.find((lap) => lap.id === lapId)?.validity).toBe("excluded");
    });

    act(() => result.current.updateStartFinish(75, 100));

    await waitFor(() => {
      expect(result.current.gate).toMatchObject({ widthMeters: 75, forwardBearingDegrees: 100 });
      expect(result.current.detection?.boundaries.some((boundary) => boundary.source === "manual")).toBe(false);
      expect(result.current.detection?.laps.some((lap) => lap.validity === "excluded")).toBe(false);
    });
  });

  it("clears boundary and validity overrides when the selected start/finish point changes", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = routePoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    act(() => result.current.useSelectedPointAsStartFinish(1));
    await waitFor(() => expect(result.current.detection?.laps.length).toBeGreaterThan(0));

    const lapId = result.current.detection!.laps[0].id;
    act(() => {
      result.current.addBoundary(3);
      result.current.setLapValidity(lapId, "excluded");
    });
    await waitFor(() => expect(result.current.detection?.boundaries.some((boundary) => boundary.source === "manual")).toBe(true));

    act(() => result.current.useSelectedPointAsStartFinish(2));

    await waitFor(() => {
      expect(result.current.detection?.boundaries.some((boundary) => boundary.source === "manual")).toBe(false);
      expect(result.current.detection?.laps.some((lap) => lap.validity === "excluded")).toBe(false);
    });
  });

  it("creates and edits ordered sector gates in trackless mode", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = routePoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    act(() => result.current.useSelectedPointAsStartFinish(1));
    act(() => result.current.addSectorGate(2));
    await waitFor(() => expect(result.current.profile?.sectorGates).toHaveLength(1));
    const firstId = result.current.profile!.sectorGates[0].id;

    act(() => result.current.updateSectorGate(firstId, {
      name: "Hairpin split",
      widthMeters: 75,
      forwardBearingDegrees: 123,
    }));
    await waitFor(() => expect(result.current.profile?.sectorGates[0]).toMatchObject({
      name: "Hairpin split",
      widthMeters: 75,
      forwardBearingDegrees: 123,
    }));

    const oldLine = result.current.profile!.sectorGates[0].line.coordinates;
    act(() => result.current.moveSectorGateToPoint(firstId, 3));
    await waitFor(() => expect(result.current.profile?.sectorGates[0].line.coordinates).not.toEqual(oldLine));

    act(() => result.current.addSectorGate(4));
    await waitFor(() => expect(result.current.profile?.sectorGates).toHaveLength(2));
    const secondId = result.current.profile!.sectorGates[1].id;
    act(() => result.current.reorderSectorGate(secondId, 0));
    await waitFor(() => expect(result.current.profile?.sectorGates[0].id).toBe(secondId));

    act(() => result.current.removeSectorGate(firstId));
    await waitFor(() => expect(result.current.profile?.sectorGates.map((gate) => gate.id)).toEqual([secondId]));
  });

  it("imports a valid TrackProfile JSON and immediately analyzes its gate", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = multiLapPoints();
    const startFinish = createGateFromRoutePoint(points, 0)!;
    const profile: TrackProfileV1 = {
      schemaVersion: 1,
      id: "imported-layout",
      name: "Imported layout",
      centerline: { type: "LineString", coordinates: points.slice(0, 6).map((point) => [point.longitude, point.latitude]) },
      direction: "unknown",
      startFinish,
      sectorGates: [],
      sections: [],
      source: { kind: "user" },
      updatedAt: "2026-07-13T00:00:00.000Z",
    };
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));

    let error: string | undefined;
    await act(async () => {
      error = await result.current.importProfile(exportTrackProfile(profile));
    });

    expect(error).toBeUndefined();
    await waitFor(() => {
      expect(result.current.profile?.name).toBe("Imported layout");
      expect(result.current.detection?.laps.filter((lap) => lap.completion === "complete")).toHaveLength(2);
    });
    expect(mocks.saveTrackProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "imported-layout" }));
  });

  it("applies a library profile and clears gate-dependent overrides", async () => {
    mocks.lookupOsmTracks.mockResolvedValue({ status: "no-match", candidates: [] });
    const points = routePoints();
    const { result } = renderHook(() => useLapWorkspace("file-1", "session.Vta", points));
    act(() => result.current.useSelectedPointAsStartFinish(1));
    await waitFor(() => expect(result.current.detection).toBeDefined());
    act(() => result.current.addBoundary(3));
    await waitFor(() => expect(result.current.detection?.boundaries.some((boundary) => boundary.source === "manual")).toBe(true));
    const applied: TrackProfileV1 = {
      ...osmCandidate().profile,
      id: "library-inje",
      source: { kind: "user" },
      startFinish: createGateFromRoutePoint(points, 2),
    };

    act(() => result.current.applyProfile(applied));

    await waitFor(() => expect(result.current.profile?.id).toBe("library-inje"));
    expect(result.current.lookupState).toBe("imported");
    expect(result.current.detection?.boundaries.some((boundary) => boundary.source === "manual")).toBe(false);
  });
});

function osmCandidate(): OsmTrackCandidate {
  const profile: TrackProfileV1 = {
    schemaVersion: 1,
    id: "osm-layout-1",
    name: "Test Circuit",
    centerline: {
      type: "LineString",
      coordinates: [
        [127, 37],
        [127.00025, 37],
        [127.0005, 37],
        [127.00075, 37],
        [127.001, 37],
      ],
    },
    direction: "unknown",
    sectorGates: [],
    sections: [],
    source: { kind: "osm", fetchedAt: "2026-07-13T00:00:00.000Z" },
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
  return { profile, medianDistanceMeters: 5, lengthRatio: 1, score: 5 };
}

function gpsPoint(index: number, latitude: number, longitude: number): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "2026-07-13",
    time: `00:00:0${index}`,
    latitude,
    longitude,
    altitudeMeters: 0,
    speedKmh: 60,
    bearingDegrees: 90,
    satelliteCount: 10,
    source: "RawGps",
    confidence: 1,
  };
}

function routePoints(): GpsPoint[] {
  return [
    gpsPoint(0, 37, 127),
    gpsPoint(1, 37, 127.001),
    gpsPoint(2, 37, 127.002),
    gpsPoint(3, 37.001, 127.002),
    gpsPoint(4, 37.001, 127),
  ];
}

function multiLapPoints(): GpsPoint[] {
  const coordinates: Array<[number, number]> = [
    [-0.0005, 0], [0.0005, 0], [0.0008, 0.0004], [0, 0.0008], [-0.0008, 0.0004], [-0.0005, 0],
    [0.0005, 0], [0.0009, 0.00025], [0.00045, 0.0008], [-0.00045, 0.0008], [-0.0005, 0], [0.0005, 0],
    [0.0008, 0.0004],
  ];
  const elapsed = [0, 1, 2, 3, 4, 5, 6, 6.8, 7.6, 8.4, 9.5, 10.5, 11.5];
  return coordinates.map(([longitude, latitude], index) => ({
    ...gpsPoint(index, latitude, longitude),
    elapsedRealtimeNanos: elapsed[index] * 1_000_000_000,
  }));
}
