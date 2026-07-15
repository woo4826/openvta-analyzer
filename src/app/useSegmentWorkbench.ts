import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzeSegmentScope, scopeSourceIndexes } from "../domain/segmentAnalysis";
import { buildSectionOpportunities } from "../domain/sectionOpportunities";
import type {
  ActiveSegment,
  AnalysisScope,
  GpsPoint,
  LapResult,
  SegmentAnalysisResult,
  SectionOpportunity,
  TrackSection,
} from "../domain/types";
import type { LineString } from "geojson";

export type SegmentFilter = "all" | "corners" | "straights";
export type SegmentAxis = "distance" | "time";

export interface SegmentWorkbenchInput {
  points: GpsPoint[];
  laps: LapResult[];
  analysisLine: LineString;
  sections: TrackSection[];
  includePartialLapSections: boolean;
}

export interface SegmentWorkbenchState {
  scope: AnalysisScope;
  filter: SegmentFilter;
  focusedLapId?: string;
  referenceLapId?: string;
  overlayLapIds: string[];
  axis: SegmentAxis;
  analysis: SegmentAnalysisResult;
  opportunities: SectionOpportunity[];
  navigationSections: TrackSection[];
  activeSegment?: ActiveSegment;
  selectSection: (sectionId: string) => void;
  selectRange: (startDistanceMeters: number, endDistanceMeters: number, source: "map" | "chart" | "manual") => void;
  resetScope: () => void;
  setFilter: (filter: SegmentFilter) => void;
  setFocusedLap: (lapId: string) => void;
  setReferenceLap: (lapId: string) => void;
  toggleOverlayLap: (lapId: string) => void;
  setAxis: (axis: SegmentAxis) => void;
}

const MAX_OVERLAY_LAPS = 5;

export function useSegmentWorkbench(input: SegmentWorkbenchInput): SegmentWorkbenchState {
  const [scope, setScope] = useState<AnalysisScope>({ kind: "whole-lap" });
  const [filter, setFilterState] = useState<SegmentFilter>("all");
  const [requestedFocusedLapId, setRequestedFocusedLapId] = useState<string>();
  const [requestedReferenceLapId, setRequestedReferenceLapId] = useState<string>();
  const [requestedOverlayLapIds, setRequestedOverlayLapIds] = useState<string[]>([]);
  const [axis, setAxis] = useState<SegmentAxis>("distance");
  const effectiveScope = useMemo<AnalysisScope>(() => (
    scope.kind === "section" && !input.sections.some((section) => section.id === scope.sectionId)
      ? { kind: "whole-lap" }
      : scope
  ), [input.sections, scope]);

  useEffect(() => {
    if (scope.kind === "section" && !input.sections.some((section) => section.id === scope.sectionId)) {
      setScope({ kind: "whole-lap" });
    }
  }, [input.sections, scope]);

  const defaultReferenceLapId = useMemo(() => [...input.laps]
    .filter((lap) => lap.completion === "complete" && lap.validity === "valid" && lap.durationSeconds !== undefined)
    .sort((left, right) => left.durationSeconds! - right.durationSeconds!)[0]?.id, [input.laps]);
  const effectiveReferenceLapId = requestedReferenceLapId && input.laps.some((lap) =>
    lap.id === requestedReferenceLapId && lap.completion === "complete" && lap.validity === "valid"
  )
    ? requestedReferenceLapId
    : defaultReferenceLapId;

  const analysis = useMemo(() => analyzeSegmentScope(
    input.points,
    input.laps,
    input.analysisLine,
    input.sections,
    effectiveScope,
    effectiveReferenceLapId,
    input.includePartialLapSections,
  ), [
    input.analysisLine,
    input.includePartialLapSections,
    input.laps,
    input.points,
    input.sections,
    effectiveReferenceLapId,
    effectiveScope,
  ]);

  const recordIds = useMemo(() => new Set(analysis.records.map((record) => record.lapId)), [analysis.records]);
  const referenceLapId = analysis.referenceLapId;
  const latestCompleteLapId = [...analysis.records].reverse().find((record) =>
    record.coverage === "complete" && record.completion === "complete" && record.validity === "valid" && record.lapId !== referenceLapId
  )?.lapId;
  const focusedLapId = requestedFocusedLapId && recordIds.has(requestedFocusedLapId)
    ? requestedFocusedLapId
    : latestCompleteLapId ?? analysis.fastestLapId ?? analysis.records[0]?.lapId;
  const navigationSections = useMemo(() => input.sections.filter((section) => {
    if (filter === "corners") return section.kind !== "straight";
    if (filter === "straights") return section.kind === "straight";
    return true;
  }), [filter, input.sections]);
  const opportunities = useMemo(() => buildSectionOpportunities(
    input.points,
    input.laps,
    input.analysisLine,
    input.sections,
    focusedLapId,
    referenceLapId,
    input.includePartialLapSections,
  ), [
    focusedLapId,
    input.analysisLine,
    input.includePartialLapSections,
    input.laps,
    input.points,
    input.sections,
    referenceLapId,
  ]);

  const overlayLapIds = useMemo(() => {
    return unique([
      focusedLapId,
      referenceLapId,
      ...requestedOverlayLapIds.filter((id) => recordIds.has(id)),
    ]).slice(0, MAX_OVERLAY_LAPS);
  }, [focusedLapId, recordIds, referenceLapId, requestedOverlayLapIds]);

  const activeSegment = useMemo((): ActiveSegment | undefined => {
    const focused = analysis.records.find((record) => record.lapId === focusedLapId);
    const indexes = focused ? scopeSourceIndexes(focused) : undefined;
    if (!indexes) return undefined;
    return {
      ...indexes,
      source: effectiveScope.kind === "range" ? effectiveScope.source : "map",
    };
  }, [analysis.records, effectiveScope, focusedLapId]);

  const selectSection = useCallback((sectionId: string) => {
    if (!input.sections.some((section) => section.id === sectionId)) return;
    setScope({ kind: "section", sectionId });
  }, [input.sections]);

  const selectRange = useCallback((left: number, right: number, source: "map" | "chart" | "manual") => {
    if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return;
    setScope({
      kind: "range",
      startDistanceMeters: Math.min(left, right),
      endDistanceMeters: Math.max(left, right),
      source,
    });
  }, []);

  const setFilter = useCallback((nextFilter: SegmentFilter) => {
    setFilterState(nextFilter);
    setScope((current) => {
      if (current.kind !== "section" || nextFilter === "all") return current;
      const selected = input.sections.find((section) => section.id === current.sectionId);
      const compatible = nextFilter === "straights" ? selected?.kind === "straight" : selected?.kind !== "straight";
      return compatible ? current : { kind: "whole-lap" };
    });
  }, [input.sections]);

  const toggleOverlayLap = useCallback((lapId: string) => {
    if (!recordIds.has(lapId)) return;
    setRequestedOverlayLapIds((current) => current.includes(lapId)
      ? current.filter((id) => id !== lapId)
      : unique([lapId, ...current]).slice(0, MAX_OVERLAY_LAPS));
  }, [recordIds]);

  return {
    scope: effectiveScope,
    filter,
    focusedLapId,
    referenceLapId,
    overlayLapIds,
    axis,
    analysis,
    opportunities,
    navigationSections,
    activeSegment,
    selectSection,
    selectRange,
    resetScope: () => setScope({ kind: "whole-lap" }),
    setFilter,
    setFocusedLap: setRequestedFocusedLapId,
    setReferenceLap: setRequestedReferenceLapId,
    toggleOverlayLap,
    setAxis,
  };
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
