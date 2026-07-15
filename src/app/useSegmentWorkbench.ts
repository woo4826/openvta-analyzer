import { useCallback, useMemo, useState } from "react";
import { analyzeSegmentScope, scopeSourceIndexes } from "../domain/segmentAnalysis";
import type {
  ActiveSegment,
  AnalysisScope,
  GpsPoint,
  LapResult,
  SegmentAnalysisResult,
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

  const analysis = useMemo(() => analyzeSegmentScope(
    input.points,
    input.laps,
    input.analysisLine,
    input.sections,
    scope,
    requestedReferenceLapId,
    input.includePartialLapSections,
  ), [
    input.analysisLine,
    input.includePartialLapSections,
    input.laps,
    input.points,
    input.sections,
    requestedReferenceLapId,
    scope,
  ]);

  const recordIds = useMemo(() => new Set(analysis.records.map((record) => record.lapId)), [analysis.records]);
  const referenceLapId = analysis.referenceLapId;
  const focusedLapId = requestedFocusedLapId && recordIds.has(requestedFocusedLapId)
    ? requestedFocusedLapId
    : analysis.fastestLapId ?? analysis.records[0]?.lapId;
  const navigationSections = useMemo(() => input.sections.filter((section) => {
    if (filter === "corners") return section.kind !== "straight";
    if (filter === "straights") return section.kind === "straight";
    return true;
  }), [filter, input.sections]);

  const overlayLapIds = useMemo(() => {
    const ranked = [...analysis.records]
      .filter((record) => record.coverage !== "none")
      .sort((left, right) => (left.deltaBestSeconds ?? Number.POSITIVE_INFINITY) - (right.deltaBestSeconds ?? Number.POSITIVE_INFINITY))
      .map((record) => record.lapId);
    return unique([
      focusedLapId,
      referenceLapId,
      ...requestedOverlayLapIds.filter((id) => recordIds.has(id)),
      ...ranked,
    ]).slice(0, MAX_OVERLAY_LAPS);
  }, [analysis.records, focusedLapId, recordIds, referenceLapId, requestedOverlayLapIds]);

  const activeSegment = useMemo((): ActiveSegment | undefined => {
    const focused = analysis.records.find((record) => record.lapId === focusedLapId);
    const indexes = focused ? scopeSourceIndexes(focused) : undefined;
    if (!indexes) return undefined;
    return {
      ...indexes,
      source: scope.kind === "range" ? scope.source : "map",
    };
  }, [analysis.records, focusedLapId, scope]);

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
    scope,
    filter,
    focusedLapId,
    referenceLapId,
    overlayLapIds,
    axis,
    analysis,
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
