import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LineString } from "geojson";
import { gateCenter, gateLine } from "../domain/geometry";
import { analyzeTimingSectorsDetailed, lapLineString, proposeTrackSections, theoreticalBestSeconds } from "../domain/lapAnalysis";
import { createGateFromRoutePoint, detectLaps } from "../domain/lapDetection";
import { lookupOsmTracks, scoreTrackProfile, type OsmLookupStatus, type OsmTrackCandidate } from "../domain/osmTracks";
import {
  loadLapAnalysisSettings,
  saveLapAnalysisSettings,
} from "../domain/settings";
import { listTrackProfiles, saveTrackProfile } from "../domain/trackStorage";
import { parseTrackProfile } from "../domain/trackProfile";
import type {
  GpsPoint,
  LapBoundaryOverride,
  LapDetectionResult,
  LapResult,
  LapValidity,
  LapValidityOverride,
  TimingSectorResult,
  TrackGate,
  TrackProfileV1,
  TrackSection,
} from "../domain/types";

export type TrackLookupState = "idle" | "cache" | "searching" | OsmLookupStatus | "imported" | "manual";

interface FileLapWorkspace {
  profile?: TrackProfileV1;
  manualGate?: TrackGate;
  lookupState: TrackLookupState;
  lookupMessage?: string;
  candidates: OsmTrackCandidate[];
  boundaryOverrides: LapBoundaryOverride[];
  validityOverrides: LapValidityOverride[];
  selectedLapIds: string[];
  primaryLapId?: string;
  referenceLapId?: string;
}

export interface LapWorkspace {
  profile?: TrackProfileV1;
  sectionCenterline?: LineString;
  gate?: TrackGate;
  lookupState: TrackLookupState;
  lookupMessage?: string;
  candidates: OsmTrackCandidate[];
  detection?: LapDetectionResult;
  sectors: TimingSectorResult[];
  theoreticalBestSeconds?: number;
  selectedLapIds: string[];
  primaryLapId?: string;
  referenceLapId?: string;
  includePartialLapSectors: boolean;
  importProfile: (text: string) => Promise<string | undefined>;
  chooseCandidate: (profileId: string) => void;
  useSelectedPointAsStartFinish: (pointIndex: number) => void;
  updateStartFinish: (widthMeters: number, forwardBearingDegrees: number) => void;
  addSectorGate: (pointIndex: number) => void;
  updateSectorGate: (gateId: string, patch: Partial<Pick<TrackGate, "name" | "widthMeters" | "forwardBearingDegrees">>) => void;
  moveSectorGateToPoint: (gateId: string, pointIndex: number) => void;
  reorderSectorGate: (gateId: string, targetIndex: number) => void;
  removeSectorGate: (gateId: string) => void;
  canProposeSections: boolean;
  proposeSections: () => void;
  updateSection: (sectionId: string, patch: Partial<TrackSection>) => void;
  removeSection: (sectionId: string) => void;
  addBoundary: (pointIndex: number) => void;
  removeBoundary: (boundaryId: string) => void;
  setLapValidity: (lapId: string, validity: LapValidity) => void;
  toggleLapSelection: (lapId: string) => void;
  setPrimaryLap: (lapId: string) => void;
  setReferenceLap: (lapId: string) => void;
  setIncludePartialLapSectors: (include: boolean) => void;
  saveCurrentProfile: () => Promise<TrackProfileV1 | undefined>;
}

const MAX_SELECTED_LAPS = 5;

export function useLapWorkspace(
  fileId: string | undefined,
  fileName: string | undefined,
  points: GpsPoint[],
): LapWorkspace {
  const [files, setFiles] = useState<Record<string, FileLapWorkspace>>({});
  const [settings, setSettings] = useState(() => loadLapAnalysisSettings());
  const lookupStarted = useRef(new Set<string>());
  const current = fileId ? files[fileId] ?? emptyWorkspace() : emptyWorkspace();
  const gate = current.profile?.startFinish ?? current.manualGate;

  const update = useCallback((updater: (workspace: FileLapWorkspace) => FileLapWorkspace) => {
    if (!fileId) return;
    setFiles((previous) => ({
      ...previous,
      [fileId]: updater(previous[fileId] ?? emptyWorkspace()),
    }));
  }, [fileId]);

  useEffect(() => {
    if (!fileId || points.length < 2 || lookupStarted.current.has(fileId)) return;
    lookupStarted.current.add(fileId);
    let cancelled = false;
    const setForFile = (updater: (workspace: FileLapWorkspace) => FileLapWorkspace) => {
      if (cancelled) return;
      setFiles((previous) => ({
        ...previous,
        [fileId]: updater(previous[fileId] ?? emptyWorkspace()),
      }));
    };
    void (async () => {
      setForFile((workspace) => ({ ...workspace, lookupState: "cache", lookupMessage: undefined }));
      const cached = (await listTrackProfiles())
        .map((profile) => ({ ...scoreTrackProfile(profile, points), profile }))
        .filter((candidate) => candidate.medianDistanceMeters <= 60 && candidate.lengthRatio >= 0.65 && candidate.lengthRatio <= 1.35)
        .sort((left, right) => left.score - right.score);
      const cachedProfile = cached[0]?.profile;
      const cachedAmbiguous = cached.length > 1 && cached[1].score <= cached[0].score * 1.18;
      if (cachedAmbiguous) {
        setForFile((workspace) => ({
          ...workspace,
          profile: undefined,
          lookupState: "ambiguous",
          lookupMessage: undefined,
          candidates: cached,
        }));
        return;
      }
      const isFresh = cachedProfile ? isFreshProfile(cachedProfile) : false;
      if (cachedProfile) {
        setForFile((workspace) => ({
          ...workspace,
          profile: cachedProfile,
          lookupState: isFresh ? "matched" : "searching",
          candidates: cached,
        }));
      }
      if (cachedProfile && isFresh) return;

      setForFile((workspace) => ({ ...workspace, lookupState: "searching" }));
      const result = await lookupOsmTracks(points);
      if (result.status === "matched" && result.candidates[0]) {
        const profile = result.candidates[0].profile;
        await saveTrackProfile(profile);
        setForFile((workspace) => workspace.lookupState === "imported" || workspace.lookupState === "manual"
          ? workspace
          : {
              ...workspace,
              profile,
              lookupState: "matched",
              lookupMessage: undefined,
              candidates: result.candidates,
            });
        return;
      }
      setForFile((workspace) => workspace.lookupState === "imported" || workspace.lookupState === "manual"
        ? workspace
        : {
            ...workspace,
            lookupState: result.status,
            lookupMessage: result.message,
            candidates: result.candidates,
          });
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, points]);

  const rawDetection = useMemo(
    () => gate && points.length ? detectLaps(points, gate, {
      boundaryOverrides: current.boundaryOverrides,
      validityOverrides: current.validityOverrides,
    }) : undefined,
    [current.boundaryOverrides, current.validityOverrides, gate, points],
  );
  const sectorAnalysis = useMemo(
    () => current.profile && rawDetection
      ? analyzeTimingSectorsDetailed(points, rawDetection.laps, current.profile, settings.includePartialLapSectors)
      : { sectors: [], missedSectorLapIds: [], warnings: [] },
    [current.profile, points, rawDetection, settings.includePartialLapSectors],
  );
  const detection = useMemo(() => {
    if (!rawDetection) return undefined;
    const missed = new Set(sectorAnalysis.missedSectorLapIds);
    return {
      ...rawDetection,
      laps: rawDetection.laps.map((lap) => missed.has(lap.id) && !lap.flags.includes("missed-sector")
        ? { ...lap, flags: [...lap.flags, "missed-sector" as const] }
        : lap),
      warnings: [...new Set([...rawDetection.warnings, ...sectorAnalysis.warnings])],
    };
  }, [rawDetection, sectorAnalysis.missedSectorLapIds, sectorAnalysis.warnings]);
  const sectors = sectorAnalysis.sectors;
  const theoretical = useMemo(
    () => theoreticalBestSeconds(sectors, current.profile ? current.profile.sectorGates.length + 1 : 0),
    [current.profile, sectors],
  );
  const representativeLap = useMemo(() => fastestCompleteLap(detection?.laps ?? []), [detection]);
  const representativeCenterline = useMemo(
    () => representativeLap ? lapLineString(points, representativeLap, 5) : undefined,
    [points, representativeLap],
  );

  useEffect(() => {
    if (!fileId) return;
    const laps = detection?.laps ?? [];
    const lapIds = new Set(laps.map((lap) => lap.id));
    const validCompleteLapIds = new Set(laps
      .filter((lap) => lap.completion === "complete" && lap.validity === "valid")
      .map((lap) => lap.id));
    const fastest = fastestCompleteLap(laps);
    setFiles((previous) => {
      const workspace = previous[fileId] ?? emptyWorkspace();
      const selectedLapIds = workspace.selectedLapIds.filter((id) => lapIds.has(id)).slice(0, MAX_SELECTED_LAPS);
      if (!selectedLapIds.length && fastest) selectedLapIds.push(fastest.id);
      const primaryLapId = workspace.primaryLapId && lapIds.has(workspace.primaryLapId)
        ? workspace.primaryLapId
        : selectedLapIds[0] ?? laps[0]?.id;
      const referenceLapId = workspace.referenceLapId && validCompleteLapIds.has(workspace.referenceLapId)
        ? workspace.referenceLapId
        : fastest?.id;
      if (
        sameStrings(selectedLapIds, workspace.selectedLapIds) &&
        primaryLapId === workspace.primaryLapId &&
        referenceLapId === workspace.referenceLapId
      ) return previous;
      return { ...previous, [fileId]: { ...workspace, selectedLapIds, primaryLapId, referenceLapId } };
    });
  }, [detection, fileId]);

  const importProfile = useCallback(async (text: string) => {
    const parsed = parseTrackProfile(text);
    if (!parsed.profile) return parsed.error ?? "Track profile could not be imported.";
    await saveTrackProfile(parsed.profile);
    update((workspace) => ({
      ...workspace,
      profile: parsed.profile,
      manualGate: undefined,
      lookupState: "imported",
      lookupMessage: undefined,
      candidates: [],
      boundaryOverrides: [],
      validityOverrides: [],
    }));
    return undefined;
  }, [update]);

  const chooseCandidate = useCallback((profileId: string) => {
    update((workspace) => {
      const candidate = workspace.candidates.find((item) => item.profile.id === profileId);
      const profile = candidate?.profile;
      if (profile) void saveTrackProfile(profile);
      return profile ? { ...workspace, profile, lookupState: "matched" } : workspace;
    });
  }, [update]);

  const useSelectedPointAsStartFinish = useCallback((pointIndex: number) => {
    const nextGate = createGateFromRoutePoint(points, pointIndex);
    if (!nextGate) return;
    update((workspace) => workspace.profile
      ? {
          ...workspace,
          profile: touchProfile({ ...workspace.profile, startFinish: nextGate }),
          manualGate: undefined,
          boundaryOverrides: [],
          validityOverrides: [],
        }
      : {
          ...workspace,
          manualGate: nextGate,
          lookupState: "manual",
          lookupMessage: undefined,
          boundaryOverrides: [],
          validityOverrides: [],
        });
  }, [points, update]);

  const updateStartFinish = useCallback((widthMeters: number, forwardBearingDegrees: number) => {
    update((workspace) => {
      const existing = workspace.profile?.startFinish ?? workspace.manualGate;
      if (!existing) return workspace;
      const normalizedWidth = Math.min(200, Math.max(10, widthMeters));
      const normalizedBearing = ((forwardBearingDegrees % 360) + 360) % 360;
      const nextGate = {
        ...existing,
        widthMeters: normalizedWidth,
        forwardBearingDegrees: normalizedBearing,
        line: gateLine(gateCenter(existing), normalizedBearing, normalizedWidth),
      };
      return workspace.profile
        ? {
            ...workspace,
            profile: touchProfile({ ...workspace.profile, startFinish: nextGate }),
            boundaryOverrides: [],
            validityOverrides: [],
          }
        : { ...workspace, manualGate: nextGate, boundaryOverrides: [], validityOverrides: [] };
    });
  }, [update]);

  const addSectorGate = useCallback((pointIndex: number) => {
    const generated = createGateFromRoutePoint(points, pointIndex);
    if (!generated) return;
    update((workspace) => {
      const profile = workspace.profile ?? recordingProfile(
        fileId,
        fileName,
        points,
        workspace.manualGate,
        representativeCenterline,
      );
      if (!profile?.startFinish) return workspace;
      const number = profile.sectorGates.length + 1;
      const sectorGate: TrackGate = { ...generated, id: `sector-${Date.now()}-${number}`, name: `Sector ${number}`, kind: "sector" };
      return {
        ...workspace,
        profile: touchProfile({ ...profile, sectorGates: [...profile.sectorGates, sectorGate] }),
        manualGate: undefined,
      };
    });
  }, [fileId, fileName, points, representativeCenterline, update]);

  const updateSectorGate = useCallback((
    gateId: string,
    patch: Partial<Pick<TrackGate, "name" | "widthMeters" | "forwardBearingDegrees">>,
  ) => {
    update((workspace) => workspace.profile ? {
      ...workspace,
      profile: touchProfile({
        ...workspace.profile,
        sectorGates: workspace.profile.sectorGates.map((sectorGate) => {
          if (sectorGate.id !== gateId) return sectorGate;
          const name = patch.name?.trim() || sectorGate.name;
          const widthMeters = Math.min(200, Math.max(10, patch.widthMeters ?? sectorGate.widthMeters));
          const forwardBearingDegrees = (((patch.forwardBearingDegrees ?? sectorGate.forwardBearingDegrees) % 360) + 360) % 360;
          return {
            ...sectorGate,
            name,
            widthMeters,
            forwardBearingDegrees,
            line: gateLine(gateCenter(sectorGate), forwardBearingDegrees, widthMeters),
          };
        }),
      }),
    } : workspace);
  }, [update]);

  const moveSectorGateToPoint = useCallback((gateId: string, pointIndex: number) => {
    const generated = createGateFromRoutePoint(points, pointIndex);
    if (!generated) return;
    update((workspace) => workspace.profile ? {
      ...workspace,
      profile: touchProfile({
        ...workspace.profile,
        sectorGates: workspace.profile.sectorGates.map((sectorGate) => sectorGate.id === gateId
          ? {
              ...sectorGate,
              forwardBearingDegrees: generated.forwardBearingDegrees,
              line: gateLine(gateCenter(generated), generated.forwardBearingDegrees, sectorGate.widthMeters),
            }
          : sectorGate),
      }),
    } : workspace);
  }, [points, update]);

  const reorderSectorGate = useCallback((gateId: string, targetIndex: number) => {
    update((workspace) => {
      if (!workspace.profile) return workspace;
      const currentIndex = workspace.profile.sectorGates.findIndex((sectorGate) => sectorGate.id === gateId);
      if (currentIndex < 0) return workspace;
      const nextIndex = Math.min(workspace.profile.sectorGates.length - 1, Math.max(0, Math.trunc(targetIndex)));
      if (currentIndex === nextIndex) return workspace;
      const sectorGates = [...workspace.profile.sectorGates];
      const [moved] = sectorGates.splice(currentIndex, 1);
      sectorGates.splice(nextIndex, 0, moved);
      return { ...workspace, profile: touchProfile({ ...workspace.profile, sectorGates }) };
    });
  }, [update]);

  const removeSectorGate = useCallback((gateId: string) => {
    update((workspace) => workspace.profile ? {
      ...workspace,
      profile: touchProfile({ ...workspace.profile, sectorGates: workspace.profile.sectorGates.filter((item) => item.id !== gateId) }),
    } : workspace);
  }, [update]);

  const proposeSections = useCallback(() => {
    if (!representativeCenterline) return;
    update((workspace) => {
      const profile = workspace.profile ?? recordingProfile(
        fileId,
        fileName,
        points,
        workspace.manualGate,
        representativeCenterline,
      );
      if (!profile?.startFinish) return workspace;
      return {
        ...workspace,
        profile: touchProfile({ ...profile, sections: proposeTrackSections(representativeCenterline) }),
        manualGate: undefined,
      };
    });
  }, [fileId, fileName, points, representativeCenterline, update]);

  const updateSection = useCallback((sectionId: string, patch: Partial<TrackSection>) => {
    update((workspace) => workspace.profile ? {
      ...workspace,
      profile: touchProfile({
        ...workspace.profile,
        sections: workspace.profile.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section),
      }),
    } : workspace);
  }, [update]);

  const removeSection = useCallback((sectionId: string) => {
    update((workspace) => workspace.profile ? {
      ...workspace,
      profile: touchProfile({ ...workspace.profile, sections: workspace.profile.sections.filter((section) => section.id !== sectionId) }),
    } : workspace);
  }, [update]);

  const addBoundary = useCallback((pointIndex: number) => {
    update((workspace) => ({
      ...workspace,
      boundaryOverrides: [...workspace.boundaryOverrides, { id: cryptoId(), type: "add", pointIndex }],
    }));
  }, [update]);

  const removeBoundary = useCallback((boundaryId: string) => {
    update((workspace) => {
      if (boundaryId.startsWith("manual-")) {
        const overrideId = boundaryId.slice("manual-".length);
        return {
          ...workspace,
          boundaryOverrides: workspace.boundaryOverrides.filter(
            (item) => !(item.type === "add" && item.id === overrideId),
          ),
        };
      }
      return {
        ...workspace,
        boundaryOverrides: [...workspace.boundaryOverrides, { id: cryptoId(), type: "remove", boundaryId }],
      };
    });
  }, [update]);

  const setLapValidity = useCallback((lapId: string, validity: LapValidity) => {
    update((workspace) => ({
      ...workspace,
      validityOverrides: [...workspace.validityOverrides.filter((item) => item.lapId !== lapId), { lapId, validity }],
    }));
  }, [update]);

  const toggleLapSelection = useCallback((lapId: string) => {
    update((workspace) => {
      const selected = workspace.selectedLapIds.includes(lapId);
      if (selected) return { ...workspace, selectedLapIds: workspace.selectedLapIds.filter((id) => id !== lapId) };
      if (workspace.selectedLapIds.length >= MAX_SELECTED_LAPS) return workspace;
      return { ...workspace, selectedLapIds: [...workspace.selectedLapIds, lapId] };
    });
  }, [update]);

  const setPrimaryLap = useCallback((lapId: string) => update((workspace) => ({ ...workspace, primaryLapId: lapId })), [update]);
  const setReferenceLap = useCallback((lapId: string) => {
    const lap = detection?.laps.find((candidate) => candidate.id === lapId);
    if (!lap || lap.completion !== "complete" || lap.validity !== "valid") return;
    update((workspace) => ({ ...workspace, referenceLapId: lapId }));
  }, [detection, update]);

  const setIncludePartialLapSectors = useCallback((includePartialLapSectors: boolean) => {
    const next = { includePartialLapSectors };
    setSettings(next);
    saveLapAnalysisSettings(next);
  }, []);

  const saveCurrentProfile = useCallback(async () => {
    const saved = current.profile ?? recordingProfile(fileId, fileName, points, current.manualGate, representativeCenterline);
    if (saved) update((workspace) => ({ ...workspace, profile: saved, manualGate: undefined }));
    if (saved) await saveTrackProfile(saved);
    return saved;
  }, [current.manualGate, current.profile, fileId, fileName, points, representativeCenterline, update]);

  return {
    profile: current.profile,
    sectionCenterline: representativeCenterline ?? current.profile?.centerline,
    gate,
    lookupState: current.lookupState,
    lookupMessage: current.lookupMessage,
    candidates: current.candidates,
    detection,
    sectors,
    theoreticalBestSeconds: theoretical,
    selectedLapIds: current.selectedLapIds,
    primaryLapId: current.primaryLapId,
    referenceLapId: current.referenceLapId,
    includePartialLapSectors: settings.includePartialLapSectors,
    importProfile,
    chooseCandidate,
    useSelectedPointAsStartFinish,
    updateStartFinish,
    addSectorGate,
    updateSectorGate,
    moveSectorGateToPoint,
    reorderSectorGate,
    removeSectorGate,
    canProposeSections: Boolean(representativeCenterline && (current.profile?.startFinish || current.manualGate)),
    proposeSections,
    updateSection,
    removeSection,
    addBoundary,
    removeBoundary,
    setLapValidity,
    toggleLapSelection,
    setPrimaryLap,
    setReferenceLap,
    setIncludePartialLapSectors,
    saveCurrentProfile,
  };
}

function emptyWorkspace(): FileLapWorkspace {
  return {
    lookupState: "idle",
    candidates: [],
    boundaryOverrides: [],
    validityOverrides: [],
    selectedLapIds: [],
  };
}

function fastestCompleteLap(laps: LapResult[]): LapResult | undefined {
  return laps
    .filter((lap) => lap.completion === "complete" && lap.validity === "valid" && lap.durationSeconds !== undefined)
    .sort((left, right) => left.durationSeconds! - right.durationSeconds!)[0];
}

function touchProfile(profile: TrackProfileV1): TrackProfileV1 {
  return { ...profile, updatedAt: new Date().toISOString() };
}

function isFreshProfile(profile: TrackProfileV1): boolean {
  if (profile.source.kind !== "osm") return true;
  const fetchedAt = profile.source.fetchedAt ? Date.parse(profile.source.fetchedAt) : Number.NaN;
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < 30 * 24 * 60 * 60 * 1000;
}

function recordingProfile(
  fileId: string | undefined,
  fileName: string | undefined,
  points: GpsPoint[],
  gate: TrackGate | undefined,
  representativeCenterline: LineString | undefined,
): TrackProfileV1 | undefined {
  if (!fileId || points.length < 2) return undefined;
  const updatedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `recording-${fileId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    name: fileName ? `${fileName} track` : "Recording track",
    centerline: representativeCenterline ?? { type: "LineString", coordinates: points.map((point) => [point.longitude, point.latitude]) },
    direction: "unknown",
    startFinish: gate,
    sectorGates: [],
    sections: [],
    source: { kind: "recording" },
    updatedAt,
  };
}

function cryptoId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
