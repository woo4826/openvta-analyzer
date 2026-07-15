import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LineString } from "geojson";
import { useTrackPresets, type EffectiveTrackProfileOrigin } from "./useTrackPresets";
import { generateAutomaticSections } from "../domain/automaticSections";
import { gateCenter, gateLine, haversineMeters, routeDistanceMeters } from "../domain/geometry";
import {
  analyzeTimingSectorsDetailed,
  lapLineString,
  proposeTrackSections,
  resampleLapByDistance,
  theoreticalBestSeconds,
} from "../domain/lapAnalysis";
import { createGateFromRoutePoint, detectLaps, inferStartFinishGateAsync } from "../domain/lapDetection";
import { lookupOsmTracks, scoreTrackProfile, type OsmLookupStatus, type OsmTrackCandidate } from "../domain/osmTracks";
import {
  loadLapAnalysisSettings,
  saveLapAnalysisSettings,
} from "../domain/settings";
import { saveTrackProfile, type TrackProfileOrigin } from "../domain/trackStorage";
import { parseTrackProfile } from "../domain/trackProfile";
import { analyzeLapSections, automaticTheoreticalBestSeconds } from "../domain/sectionAnalysis";
import type {
  GpsPoint,
  LapBoundaryOverride,
  LapDetectionResult,
  LapResult,
  LapSectionResult,
  LapValidity,
  LapValidityOverride,
  TimingSectorResult,
  TrackGate,
  TrackProfileV1,
  TrackSection,
  TrackSectionKind,
} from "../domain/types";

export type TrackLookupState = "idle" | "cache" | "searching" | OsmLookupStatus | "imported" | "manual" | "generated";

interface FileLapWorkspace {
  profile?: TrackProfileV1;
  profileOrigin?: EffectiveTrackProfileOrigin;
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
  profileOrigin?: EffectiveTrackProfileOrigin;
  sectionCenterline?: LineString;
  gate?: TrackGate;
  lookupState: TrackLookupState;
  lookupMessage?: string;
  candidates: OsmTrackCandidate[];
  detection?: LapDetectionResult;
  sectors: TimingSectorResult[];
  theoreticalBestSeconds?: number;
  analysisLine?: LineString;
  sectionResults: LapSectionResult[];
  automaticTheoreticalBestSeconds?: number;
  selectedLapIds: string[];
  primaryLapId?: string;
  referenceLapId?: string;
  includePartialLapSectors: boolean;
  importProfile: (text: string) => Promise<string | undefined>;
  applyProfile: (profile: TrackProfileV1, origin?: TrackProfileOrigin) => void;
  chooseCandidate: (profileId: string) => void;
  useSelectedPointAsStartFinish: (pointIndex: number) => void;
  updateStartFinish: (widthMeters: number, forwardBearingDegrees: number) => void;
  addSectorGate: (pointIndex: number) => void;
  updateSectorGate: (gateId: string, patch: Partial<Pick<TrackGate, "name" | "widthMeters" | "forwardBearingDegrees">>) => void;
  moveSectorGateToPoint: (gateId: string, pointIndex: number) => void;
  reorderSectorGate: (gateId: string, targetIndex: number) => void;
  removeSectorGate: (gateId: string) => void;
  canProposeSections: boolean;
  canGenerateAutomaticSections: boolean;
  proposeSections: () => void;
  recalculateAutomaticSections: (replaceAll: boolean) => void;
  updateSection: (sectionId: string, patch: Partial<TrackSection>) => void;
  removeSection: (sectionId: string) => void;
  saveRangeAsSection: (startDistanceMeters: number, endDistanceMeters: number, name: string, kind: TrackSectionKind) => TrackSection | undefined;
  addBoundary: (pointIndex: number) => void;
  removeBoundary: (boundaryId: string) => void;
  setLapValidity: (lapId: string, validity: LapValidity) => void;
  toggleLapSelection: (lapId: string) => void;
  setPrimaryLap: (lapId: string) => void;
  setReferenceLap: (lapId: string) => void;
  setIncludePartialLapSectors: (include: boolean) => void;
  saveCurrentProfile: () => Promise<TrackProfileV1 | undefined>;
  resetProfileOverride: () => Promise<void>;
}

const MAX_SELECTED_LAPS = 5;

export function useLapWorkspace(
  fileId: string | undefined,
  fileName: string | undefined,
  points: GpsPoint[],
): LapWorkspace {
  const [files, setFiles] = useState<Record<string, FileLapWorkspace>>({});
  const [settings, setSettings] = useState(() => loadLapAnalysisSettings());
  const trackPresets = useTrackPresets(points);
  const lookupStarted = useRef(new Set<string>());
  const persistedAutomaticProfiles = useRef(new Set<string>());
  const persistedLocalOverrides = useRef(new Set<string>());
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
    if (!fileId || points.length < 2 || trackPresets.status === "loading" || lookupStarted.current.has(fileId)) return;
    lookupStarted.current.add(fileId);
    let cancelled = false;
    let inferredGatePromise: Promise<TrackGate | undefined> | undefined;
    const getInferredGate = () => {
      inferredGatePromise ??= inferStartFinishGateAsync(points);
      return inferredGatePromise;
    };
    const setForFile = (updater: (workspace: FileLapWorkspace) => FileLapWorkspace) => {
      if (cancelled) return;
      setFiles((previous) => ({
        ...previous,
        [fileId]: updater(previous[fileId] ?? emptyWorkspace()),
      }));
    };
    void (async () => {
      setForFile((workspace) => ({ ...workspace, lookupState: "cache", lookupMessage: undefined }));
      const cached = trackPresets.profiles
        .map(({ profile, origin }) => ({ ...scoreTrackProfile(profile, points), profile, origin }))
        .filter((candidate) => candidate.medianDistanceMeters <= 60 && candidate.lengthRatio >= 0.65 && candidate.lengthRatio <= 1.35)
        .sort((left, right) => left.score - right.score);
      const cachedResolution = resolveCachedProfile(cached);
      const cachedProfile = cachedResolution.profile;
      if (cachedResolution.ambiguous) {
        setForFile((workspace) => ({
          ...workspace,
          profile: undefined,
          profileOrigin: undefined,
          lookupState: "ambiguous",
          lookupMessage: undefined,
          candidates: cached,
        }));
        return;
      }
      const profileOrigin = cachedProfile
        ? cached.find((candidate) => candidate.profile.id === cachedProfile.id)?.origin
        : undefined;
      const isFresh = cachedProfile
        ? profileOrigin !== "osm" || isFreshProfile(cachedProfile)
        : false;
      if (cachedProfile) {
        const profile = addInferredGate(
          cachedProfile,
          cachedProfile.startFinish ? undefined : await getInferredGate(),
        );
        if (profile !== cachedProfile && profileOrigin !== "built-in") {
          await saveTrackProfile(profile, profileOrigin);
        }
        setForFile((workspace) => ({
          ...workspace,
          profile,
          profileOrigin,
          lookupState: isFresh ? "matched" : "searching",
          candidates: cached,
        }));
      }
      if (cachedProfile && isFresh) return;

      setForFile((workspace) => ({
        ...workspace,
        lookupState: "searching",
      }));
      const result = await lookupOsmTracks(points);
      if (result.status === "matched" && result.candidates[0]) {
        const mergedProfiles = result.candidates.map((candidate, index) => (
          index === 0 ? mergeLocalAnalysis(candidate.profile, cachedProfile) : candidate.profile
        ));
        const inferredGate = mergedProfiles.some((profile) => !profile.startFinish)
          ? await getInferredGate()
          : undefined;
        const candidates = result.candidates.map((candidate, index) => ({
          ...candidate,
          profile: addInferredGate(mergedProfiles[index], inferredGate),
        }));
        const profile = candidates[0].profile;
        await saveTrackProfile(profile);
        setForFile((workspace) => workspace.lookupState === "imported" || workspace.lookupState === "manual"
          ? workspace
          : {
              ...workspace,
              profile,
              profileOrigin: "osm",
              lookupState: "matched",
              lookupMessage: undefined,
              candidates,
            });
        return;
      }
      const inferredGate = result.status !== "ambiguous" ? await getInferredGate() : undefined;
      setForFile((workspace) => workspace.lookupState === "imported" || workspace.lookupState === "manual"
        ? workspace
        : {
            ...workspace,
            manualGate: result.status !== "ambiguous" && !(workspace.profile?.startFinish || workspace.manualGate)
              ? inferredGate
              : workspace.manualGate,
            lookupState: inferredGate && result.status !== "ambiguous" ? "generated" : result.status,
            lookupMessage: inferredGate && result.status !== "ambiguous" ? undefined : result.message,
            candidates: result.candidates,
          });
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, points, trackPresets.profiles, trackPresets.status]);

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
  const generatedSections = useMemo(() => {
    if (!representativeLap) return [];
    const samples = resampleLapByDistance(points, representativeLap, 5);
    let lineDistanceMeters = 0;
    return generateAutomaticSections(samples.map((sample, index) => {
      if (index > 0) {
        lineDistanceMeters += haversineMeters(
          [samples[index - 1].longitude, samples[index - 1].latitude],
          [sample.longitude, sample.latitude],
        );
      }
      return { ...sample, distanceMeters: lineDistanceMeters };
    }));
  }, [points, representativeLap]);
  const analysisLine = current.profile?.analysisLine ?? representativeCenterline ?? current.profile?.centerline;
  const sectionResults = useMemo(
    () => current.profile && detection && analysisLine
      ? analyzeLapSections(
          points,
          detection.laps,
          analysisLine,
          current.profile.sections,
          settings.includePartialLapSectors,
        )
      : [],
    [analysisLine, current.profile, detection, points, settings.includePartialLapSectors],
  );
  const automaticTheoretical = useMemo(
    () => automaticTheoreticalBestSeconds(sectionResults, current.profile?.sections.length ?? 0),
    [current.profile?.sections.length, sectionResults],
  );

  useEffect(() => {
    if (!fileId || !representativeCenterline || !generatedSections.length) return;
    setFiles((previous) => {
      const workspace = previous[fileId] ?? emptyWorkspace();
      if (workspace.profile?.sections.length) return previous;
      const profile = workspace.profile ?? recordingProfile(
        fileId,
        fileName,
        points,
        workspace.manualGate,
        representativeCenterline,
      );
      if (!profile?.startFinish) return previous;
      return {
        ...previous,
        [fileId]: {
          ...withEditedProfile(workspace, touchProfile({
            ...profile,
            analysisLine: representativeCenterline,
            sections: generatedSections,
          })),
          manualGate: undefined,
        },
      };
    });
  }, [current.profile, fileId, fileName, generatedSections, points, representativeCenterline]);

  useEffect(() => {
    const profile = current.profile;
    if (
      current.profileOrigin === "local-override" ||
      current.profileOrigin === "built-in" ||
      !profile?.startFinish ||
      !profile.analysisLine ||
      !profile.sections.some((section) => section.source === "automatic")
    ) return;
    const revision = `${profile.id}:${profile.updatedAt}`;
    if (persistedAutomaticProfiles.current.has(revision)) return;
    persistedAutomaticProfiles.current.add(revision);
    const origin = current.profileOrigin ?? inferEditedProfileOrigin(profile);
    void saveTrackProfile(profile, origin).catch(() => {
      persistedAutomaticProfiles.current.delete(revision);
    });
  }, [current.profile, current.profileOrigin]);

  useEffect(() => {
    const profile = current.profile;
    if (!profile || current.profileOrigin !== "local-override") return;
    const revision = `${profile.id}:${profile.updatedAt}`;
    if (persistedLocalOverrides.current.has(revision)) return;
    persistedLocalOverrides.current.add(revision);
    void saveTrackProfile(profile, "local-override").catch(() => {
      persistedLocalOverrides.current.delete(revision);
    });
  }, [current.profile, current.profileOrigin]);

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
    await saveTrackProfile(parsed.profile, "imported");
    update((workspace) => ({
      ...workspace,
      profile: parsed.profile,
      profileOrigin: "imported",
      manualGate: undefined,
      lookupState: "imported",
      lookupMessage: undefined,
      candidates: [],
      boundaryOverrides: [],
      validityOverrides: [],
    }));
    return undefined;
  }, [update]);

  const applyProfile = useCallback((profile: TrackProfileV1, origin?: TrackProfileOrigin) => {
    update((workspace) => ({
      ...workspace,
      profile,
      profileOrigin: origin ?? inferEditedProfileOrigin(profile),
      manualGate: undefined,
      lookupState: origin === "generated" ? "generated" : "imported",
      lookupMessage: undefined,
      candidates: [],
      boundaryOverrides: [],
      validityOverrides: [],
    }));
  }, [update]);

  const chooseCandidate = useCallback((profileId: string) => {
    const candidate = current.candidates.find((item) => item.profile.id === profileId);
    if (!candidate) return;
    void (async () => {
      const inferredGate = candidate.profile.startFinish ? undefined : await inferStartFinishGateAsync(points);
      const profile = addInferredGate(candidate.profile, inferredGate);
      const origin = trackPresets.profiles.find((item) => item.profile.id === profileId)?.origin ?? "osm";
      if (origin !== "built-in") await saveTrackProfile(profile, origin);
      update((workspace) => workspace.candidates.some((item) => item.profile.id === profileId)
        ? {
            ...workspace,
            profile,
            profileOrigin: origin,
            lookupState: "matched",
          }
        : workspace);
    })();
  }, [current.candidates, points, trackPresets.profiles, update]);

  const useSelectedPointAsStartFinish = useCallback((pointIndex: number) => {
    const nextGate = createGateFromRoutePoint(points, pointIndex);
    if (!nextGate) return;
    update((workspace) => workspace.profile
      ? {
          ...withEditedProfile(workspace, touchProfile({ ...workspace.profile, startFinish: nextGate })),
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
            ...withEditedProfile(workspace, touchProfile({ ...workspace.profile, startFinish: nextGate })),
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
        ...withEditedProfile(workspace, touchProfile({ ...profile, sectorGates: [...profile.sectorGates, sectorGate] })),
        manualGate: undefined,
      };
    });
  }, [fileId, fileName, points, representativeCenterline, update]);

  const updateSectorGate = useCallback((
    gateId: string,
    patch: Partial<Pick<TrackGate, "name" | "widthMeters" | "forwardBearingDegrees">>,
  ) => {
    update((workspace) => workspace.profile ? withEditedProfile(workspace, touchProfile({
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
      })) : workspace);
  }, [update]);

  const moveSectorGateToPoint = useCallback((gateId: string, pointIndex: number) => {
    const generated = createGateFromRoutePoint(points, pointIndex);
    if (!generated) return;
    update((workspace) => workspace.profile ? withEditedProfile(workspace, touchProfile({
        ...workspace.profile,
        sectorGates: workspace.profile.sectorGates.map((sectorGate) => sectorGate.id === gateId
          ? {
              ...sectorGate,
              forwardBearingDegrees: generated.forwardBearingDegrees,
              line: gateLine(gateCenter(generated), generated.forwardBearingDegrees, sectorGate.widthMeters),
            }
          : sectorGate),
      })) : workspace);
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
      return withEditedProfile(workspace, touchProfile({ ...workspace.profile, sectorGates }));
    });
  }, [update]);

  const removeSectorGate = useCallback((gateId: string) => {
    update((workspace) => workspace.profile
      ? withEditedProfile(workspace, touchProfile({ ...workspace.profile, sectorGates: workspace.profile.sectorGates.filter((item) => item.id !== gateId) }))
      : workspace);
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
        ...withEditedProfile(workspace, touchProfile({
          ...profile,
          analysisLine: representativeCenterline,
          sections: proposeTrackSections(representativeCenterline),
        })),
        manualGate: undefined,
      };
    });
  }, [fileId, fileName, points, representativeCenterline, update]);

  const recalculateAutomaticSections = useCallback((replaceAll: boolean) => {
    if (!representativeCenterline || !generatedSections.length) return;
    update((workspace) => {
      const profile = workspace.profile ?? recordingProfile(
        fileId,
        fileName,
        points,
        workspace.manualGate,
        representativeCenterline,
      );
      if (!profile?.startFinish || (profile.sections.length && !replaceAll)) return workspace;
      return {
        ...withEditedProfile(workspace, touchProfile({
          ...profile,
          analysisLine: representativeCenterline,
          sections: generatedSections,
        })),
        manualGate: undefined,
      };
    });
  }, [fileId, fileName, generatedSections, points, representativeCenterline, update]);

  const updateSection = useCallback((sectionId: string, patch: Partial<TrackSection>) => {
    update((workspace) => workspace.profile ? withEditedProfile(workspace, touchProfile({
        ...workspace.profile,
        sections: workspace.profile.sections.map((section) => {
          if (section.id !== sectionId) return section;
          const length = analysisLine ? routeDistanceMeters(analysisLine.coordinates) : section.endDistanceMeters;
          let startDistanceMeters = Math.min(length, Math.max(0, patch.startDistanceMeters ?? section.startDistanceMeters));
          let endDistanceMeters = Math.min(length, Math.max(0, patch.endDistanceMeters ?? section.endDistanceMeters));
          if (startDistanceMeters >= endDistanceMeters) {
            if (patch.startDistanceMeters !== undefined) startDistanceMeters = Math.max(0, endDistanceMeters - 1);
            else endDistanceMeters = Math.min(length, startDistanceMeters + 1);
          }
          return {
            ...section,
            ...patch,
            startDistanceMeters,
            endDistanceMeters,
            source: "user",
            confidence: undefined,
          };
        }),
      })) : workspace);
  }, [analysisLine, update]);

  const removeSection = useCallback((sectionId: string) => {
    update((workspace) => workspace.profile
      ? withEditedProfile(workspace, touchProfile({ ...workspace.profile, sections: workspace.profile.sections.filter((section) => section.id !== sectionId) }))
      : workspace);
  }, [update]);

  const saveRangeAsSection = useCallback((
    startDistanceMeters: number,
    endDistanceMeters: number,
    name: string,
    kind: TrackSectionKind,
  ): TrackSection | undefined => {
    if (!current.profile || !analysisLine) return undefined;
    const lineLength = routeDistanceMeters(analysisLine.coordinates);
    const start = Math.max(0, Math.min(lineLength, Math.min(startDistanceMeters, endDistanceMeters)));
    const end = Math.max(0, Math.min(lineLength, Math.max(startDistanceMeters, endDistanceMeters)));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 1) return undefined;
    const section: TrackSection = {
      id: `user-section-${cryptoId()}`,
      name: name.trim() || `Custom segment ${current.profile.sections.length + 1}`,
      kind,
      startDistanceMeters: start,
      endDistanceMeters: end,
      source: "user",
    };
    update((workspace) => {
      if (!workspace.profile || workspace.profile.id !== current.profile?.id) return workspace;
      const sections = [...workspace.profile.sections, section]
        .sort((left, right) => left.startDistanceMeters - right.startDistanceMeters);
      return withEditedProfile(workspace, touchProfile({ ...workspace.profile, sections }));
    });
    return section;
  }, [analysisLine, current.profile, update]);

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
    const origin = current.profileOrigin === "built-in" ? "local-override" : current.profileOrigin ?? "generated";
    if (saved) update((workspace) => ({ ...workspace, profile: saved, profileOrigin: origin, manualGate: undefined }));
    if (saved) await saveTrackProfile(saved, origin);
    return saved;
  }, [current.manualGate, current.profile, current.profileOrigin, fileId, fileName, points, representativeCenterline, update]);

  const resetProfileOverride = useCallback(async () => {
    const id = current.profile?.id;
    if (!id || current.profileOrigin !== "local-override") return;
    await trackPresets.resetOverride(id);
    const hosted = trackPresets.hostedProfiles.find((profile) => profile.id === id);
    if (!hosted) return;
    update((workspace) => ({
      ...workspace,
      profile: hosted,
      profileOrigin: "built-in",
      boundaryOverrides: [],
      validityOverrides: [],
    }));
  }, [current.profile?.id, current.profileOrigin, trackPresets, update]);

  return {
    profile: current.profile,
    profileOrigin: current.profileOrigin,
    sectionCenterline: representativeCenterline ?? current.profile?.centerline,
    gate,
    lookupState: current.lookupState,
    lookupMessage: current.lookupMessage,
    candidates: current.candidates,
    detection,
    sectors,
    theoreticalBestSeconds: theoretical,
    analysisLine,
    sectionResults,
    automaticTheoreticalBestSeconds: automaticTheoretical,
    selectedLapIds: current.selectedLapIds,
    primaryLapId: current.primaryLapId,
    referenceLapId: current.referenceLapId,
    includePartialLapSectors: settings.includePartialLapSectors,
    importProfile,
    applyProfile,
    chooseCandidate,
    useSelectedPointAsStartFinish,
    updateStartFinish,
    addSectorGate,
    updateSectorGate,
    moveSectorGateToPoint,
    reorderSectorGate,
    removeSectorGate,
    canProposeSections: Boolean(representativeCenterline && (current.profile?.startFinish || current.manualGate)),
    canGenerateAutomaticSections: Boolean(representativeCenterline && generatedSections.length && (current.profile?.startFinish || current.manualGate)),
    proposeSections,
    recalculateAutomaticSections,
    updateSection,
    removeSection,
    saveRangeAsSection,
    addBoundary,
    removeBoundary,
    setLapValidity,
    toggleLapSelection,
    setPrimaryLap,
    setReferenceLap,
    setIncludePartialLapSectors,
    saveCurrentProfile,
    resetProfileOverride,
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

function withEditedProfile(workspace: FileLapWorkspace, profile: TrackProfileV1): FileLapWorkspace {
  return {
    ...workspace,
    profile,
    profileOrigin: workspace.profileOrigin === "built-in"
      ? "local-override"
      : workspace.profileOrigin ?? inferEditedProfileOrigin(profile),
  };
}

function inferEditedProfileOrigin(profile: TrackProfileV1): Exclude<EffectiveTrackProfileOrigin, "built-in"> {
  if (profile.source.kind === "recording") return "generated";
  if (profile.source.kind === "osm") return "osm";
  return "imported";
}

function isFreshProfile(profile: TrackProfileV1): boolean {
  if (profile.source.kind !== "osm") return true;
  const fetchedAt = profile.source.fetchedAt ? Date.parse(profile.source.fetchedAt) : Number.NaN;
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < 30 * 24 * 60 * 60 * 1000;
}

function addInferredGate(profile: TrackProfileV1, inferredGate: TrackGate | undefined): TrackProfileV1 {
  if (profile.startFinish || !inferredGate) return profile;
  return touchProfile({ ...profile, startFinish: inferredGate });
}

type CachedTrackCandidate = OsmTrackCandidate & { origin: EffectiveTrackProfileOrigin };

function resolveCachedProfile(candidates: CachedTrackCandidate[]): { profile?: TrackProfileV1; ambiguous: boolean } {
  const best = candidates[0];
  if (!best) return { ambiguous: false };
  const nearbyThreshold = Math.max(best.score * 1.18, best.score + 8);
  const nearby = candidates.filter((candidate) => candidate.score <= nearbyThreshold);
  if (nearby.length <= 1) return { profile: best.profile, ambiguous: false };

  const localOverrides = nearby.filter((candidate) => candidate.origin === "local-override");
  if (localOverrides.length === 1) {
    return { profile: localOverrides[0].profile, ambiguous: false };
  }

  const builtIns = nearby.filter((candidate) => candidate.origin === "built-in");
  const onlyDiscoveryAlternatives = nearby.every((candidate) =>
    candidate.origin === "built-in" || candidate.origin === "osm" || candidate.origin === "generated"
  );
  if (builtIns.length === 1 && onlyDiscoveryAlternatives) {
    return { profile: builtIns[0].profile, ambiguous: false };
  }

  const reusablePresets = nearby.filter((candidate) => candidate.profile.source.kind !== "recording");
  const hasGeneratedFallback = nearby.some((candidate) => candidate.profile.source.kind === "recording");
  if (reusablePresets.length === 1 && hasGeneratedFallback) {
    return { profile: reusablePresets[0].profile, ambiguous: false };
  }
  return { ambiguous: true };
}

function mergeLocalAnalysis(remote: TrackProfileV1, local: TrackProfileV1 | undefined): TrackProfileV1 {
  if (!local || local.id !== remote.id) return remote;
  return {
    ...remote,
    analysisLine: local.analysisLine ?? remote.analysisLine,
    startFinish: local.startFinish ?? remote.startFinish,
    sectorGates: local.sectorGates.length ? local.sectorGates : remote.sectorGates,
    sections: local.sections.length ? local.sections : remote.sections,
    pitLane: local.pitLane ?? remote.pitLane,
  };
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
