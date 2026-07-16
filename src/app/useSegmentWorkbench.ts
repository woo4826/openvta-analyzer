import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzeSegmentScope, scopeSourceIndexes } from "../domain/segmentAnalysis";
import type {
  ActiveSegment,
  AnalysisScope,
  GpsPoint,
  LapResult,
  SegmentAnalysisResult,
  SegmentLapVisibility,
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
  lapVisibility?: SegmentLapVisibility;
}

export interface SegmentWorkbenchState {
  scope: AnalysisScope;
  filter: SegmentFilter;
  focusedLapId?: string;
  referenceLapId?: string;
  visibleLapIds: string[];
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
  setAxis: (axis: SegmentAxis) => void;
}

export function useSegmentWorkbench(input: SegmentWorkbenchInput): SegmentWorkbenchState {
  const [scope, setScope] = useState<AnalysisScope>({ kind: "whole-lap" });
  const [filter, setFilterState] = useState<SegmentFilter>("all");
  const [requestedFocusedLapId, setRequestedFocusedLapId] = useState<string>();
  const [requestedReferenceLapId, setRequestedReferenceLapId] = useState<string>();
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

  const usableRecords = useMemo(
    () => analysis.records.filter((record) => record.trajectory.length > 1),
    [analysis.records],
  );
  const usableRecordIds = useMemo(
    () => new Set(usableRecords.map((record) => record.lapId)),
    [usableRecords],
  );
  const referenceLapId = analysis.referenceLapId;
  const latestCompleteLapId = [...usableRecords].reverse().find((record) =>
    record.coverage === "complete" && record.completion === "complete" && record.validity === "valid" && record.lapId !== referenceLapId
  )?.lapId;
  const defaultFocusedLapId = latestCompleteLapId
    ?? (analysis.fastestLapId !== referenceLapId && usableRecordIds.has(analysis.fastestLapId ?? "")
      ? analysis.fastestLapId
      : undefined)
    ?? usableRecords.find((record) => record.lapId !== referenceLapId)?.lapId
    ?? (referenceLapId && usableRecordIds.has(referenceLapId) ? referenceLapId : usableRecords[0]?.lapId);
  const requestedFocusIsAvailable = requestedFocusedLapId && usableRecordIds.has(requestedFocusedLapId);
  const focusedLapId = requestedFocusIsAvailable
    && (usableRecords.length < 2 || requestedFocusedLapId !== referenceLapId)
    ? requestedFocusedLapId
    : defaultFocusedLapId;
  const eligibleReferenceRecords = useMemo(() => analysis.records.filter(isEligibleReference), [analysis.records]);
  const eligibleReferenceIds = useMemo(
    () => new Set(eligibleReferenceRecords.map((record) => record.lapId)),
    [eligibleReferenceRecords],
  );
  const navigationSections = useMemo(() => input.sections.filter((section) => {
    if (filter === "corners") return section.kind !== "straight";
    if (filter === "straights") return section.kind === "straight";
    return true;
  }), [filter, input.sections]);
  const visibleLapIds = useMemo(() => {
    if (input.lapVisibility === "all") return analysis.records.map((record) => record.lapId);
    if (input.lapVisibility === "focus-only") return unique([focusedLapId]);
    return unique([focusedLapId, referenceLapId]);
  }, [analysis.records, focusedLapId, input.lapVisibility, referenceLapId]);

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
    const selected = input.sections.find((section) => section.id === sectionId);
    if (!selected) return;
    setFilterState((current) => sectionMatchesFilter(selected, current) ? current : "all");
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
      return selected && sectionMatchesFilter(selected, nextFilter) ? current : { kind: "whole-lap" };
    });
  }, [input.sections]);

  const setFocusedLap = useCallback((lapId: string) => {
    if (!usableRecordIds.has(lapId)) return;
    if (usableRecords.length > 1 && lapId === referenceLapId) {
      const nextReferenceLapId = focusedLapId
        && focusedLapId !== lapId
        && eligibleReferenceIds.has(focusedLapId)
        ? focusedLapId
        : eligibleReferenceRecords.find((record) => record.lapId !== lapId)?.lapId;
      if (!nextReferenceLapId) return;
      setRequestedReferenceLapId(nextReferenceLapId);
    }
    setRequestedFocusedLapId(lapId);
  }, [eligibleReferenceIds, eligibleReferenceRecords, focusedLapId, referenceLapId, usableRecordIds, usableRecords.length]);

  const setReferenceLap = useCallback((lapId: string) => {
    if (!eligibleReferenceIds.has(lapId)) {
      setRequestedReferenceLapId(undefined);
      return;
    }
    if (usableRecords.length > 1 && lapId === focusedLapId) {
      const nextFocusedLapId = referenceLapId && referenceLapId !== lapId && usableRecordIds.has(referenceLapId)
        ? referenceLapId
        : usableRecords.find((record) => record.lapId !== lapId)?.lapId;
      if (nextFocusedLapId) setRequestedFocusedLapId(nextFocusedLapId);
    }
    setRequestedReferenceLapId(lapId);
  }, [eligibleReferenceIds, focusedLapId, referenceLapId, usableRecordIds, usableRecords]);

  return {
    scope: effectiveScope,
    filter,
    focusedLapId,
    referenceLapId,
    visibleLapIds,
    axis,
    analysis,
    navigationSections,
    activeSegment,
    selectSection,
    selectRange,
    resetScope: () => setScope({ kind: "whole-lap" }),
    setFilter,
    setFocusedLap,
    setReferenceLap,
    setAxis,
  };
}

function sectionMatchesFilter(section: TrackSection, filter: SegmentFilter): boolean {
  if (filter === "straights") return section.kind === "straight";
  if (filter === "corners") return section.kind !== "straight";
  return true;
}

function isEligibleReference(record: SegmentAnalysisResult["records"][number]): boolean {
  return record.completion === "complete" && record.eligibleForBest && record.trajectory.length > 1;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
