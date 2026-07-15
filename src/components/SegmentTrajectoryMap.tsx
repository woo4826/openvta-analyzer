import { useMemo } from "react";
import type { LineString } from "geojson";
import type {
  ActiveSegment,
  AxisAlignedRegion,
  GpsPoint,
  MapSettings,
  SegmentAnalysisResult,
  SegmentLapRecord,
  TrackSection,
} from "../domain/types";
import {
  RouteMap,
  type LapMapOverlay,
  type MapGhostMarker,
  type MapHeatSegment,
} from "./RouteMap";
import { useI18n } from "../i18n/useI18n";
import { FOCUSED_LAP_COLOR, REFERENCE_LAP_COLOR } from "./segmentTelemetryOptions";

interface SegmentTrajectoryMapProps {
  analysis: SegmentAnalysisResult;
  points: GpsPoint[];
  centerline: LineString;
  sections: TrackSection[];
  settings: MapSettings;
  selectedIndex: number;
  focusedLapId?: string;
  referenceLapId?: string;
  cursorDistanceMeters?: number;
  segment?: ActiveSegment;
  region?: AxisAlignedRegion;
  onSelectedIndex: (index: number) => void;
  onSectionSelect: (sectionId: string) => void;
  onSegmentChange?: (segment?: ActiveSegment) => void;
  onRegionChange?: (region?: AxisAlignedRegion) => void;
  onSettingsChange?: (settings: MapSettings) => void;
}

export function SegmentTrajectoryMap({
  analysis,
  points,
  centerline,
  sections,
  settings,
  selectedIndex,
  focusedLapId,
  referenceLapId,
  cursorDistanceMeters,
  segment,
  region,
  onSelectedIndex,
  onSectionSelect,
  onSegmentChange = () => undefined,
  onRegionChange = () => undefined,
  onSettingsChange = () => undefined,
}: SegmentTrajectoryMapProps) {
  const { t } = useI18n();
  const roleLapIds = useMemo(() => new Set(
    [focusedLapId, referenceLapId].filter((lapId): lapId is string => Boolean(lapId)),
  ), [focusedLapId, referenceLapId]);
  const colorByLap = useMemo(() => new Map(
    analysis.records.filter((record) => roleLapIds.has(record.lapId)).map((record) => [
      record.lapId,
      record.lapId === focusedLapId
        ? FOCUSED_LAP_COLOR
        : REFERENCE_LAP_COLOR,
    ]),
  ), [analysis.records, focusedLapId, roleLapIds]);
  const lapOverlays = useMemo((): LapMapOverlay[] => analysis.records
    .filter((record) => roleLapIds.has(record.lapId) && record.trajectory.length >= 2)
    .sort((left, right) => pathLayerRank(left.lapId, focusedLapId, referenceLapId) - pathLayerRank(right.lapId, focusedLapId, referenceLapId))
    .map((record) => {
      const focused = record.lapId === focusedLapId;
      const reference = record.lapId === referenceLapId;
      return {
        id: record.lapId,
        color: colorByLap.get(record.lapId) ?? "#64748b",
        points: record.trajectory.map((sample) => toGpsPoint(sample, points[sample.sourceIndex])),
        width: focused ? 8 : reference ? 6 : 4,
        opacity: focused ? 0.96 : reference ? 0.9 : 0.58,
        dashArray: reference && !focused ? [3, 2] : undefined,
      };
    }), [analysis.records, colorByLap, focusedLapId, points, referenceLapId, roleLapIds]);
  const focusedInteractionPoints = useMemo(
    () => lapOverlays.find((overlay) => overlay.id === focusedLapId)?.points ?? [],
    [focusedLapId, lapOverlays],
  );

  const focusedRecord = analysis.records.find((record) => record.lapId === focusedLapId && roleLapIds.has(record.lapId));
  const heatSegments = useMemo((): MapHeatSegment[] => {
    if (!focusedRecord || focusedRecord.coverage !== "complete" || focusedRecord.gpsConfidence === "low") return [];
    return focusedRecord.trajectory.slice(1).flatMap((sample, index) => {
      const previous = focusedRecord.trajectory[index];
      if (sample.lossRateSecondsPer100m === undefined) return [];
      return [{
        id: `${focusedRecord.lapId}-${index}`,
        coordinates: [
          [previous.longitude, previous.latitude],
          [sample.longitude, sample.latitude],
        ],
        color: lossRateColor(sample.lossRateSecondsPer100m),
        width: 10,
        opacity: 0.88,
      } satisfies MapHeatSegment];
    });
  }, [focusedRecord]);

  const ghostMarkers = useMemo((): MapGhostMarker[] => {
    const scopeLength = analysis.range.endDistanceMeters - analysis.range.startDistanceMeters;
    const progress = Math.max(0, Math.min(scopeLength, cursorDistanceMeters ?? scopeLength / 2));
    return uniqueRecords([
      analysis.records.find((record) => record.lapId === focusedLapId),
      analysis.records.find((record) => record.lapId === referenceLapId),
    ]).filter((record) => roleLapIds.has(record.lapId)).flatMap((record) => {
      const sample = nearestSample(record, progress);
      if (!sample) return [];
      const role = record.lapId === focusedLapId ? "focused" : "reference";
      return [{
        id: `${role}-${record.lapId}`,
        label: `${t("lap.lap")} ${record.ordinal} ${role === "focused" ? t("lap.workbench.focusedGhost") : t("lap.workbench.referenceGhost")}`,
        coordinate: [sample.longitude, sample.latitude],
        color: colorByLap.get(record.lapId) ?? "#64748b",
      } satisfies MapGhostMarker];
    });
  }, [analysis.range.endDistanceMeters, analysis.range.startDistanceMeters, analysis.records, colorByLap, cursorDistanceMeters, focusedLapId, referenceLapId, roleLapIds, t]);

  const fastest = analysis.records.find((record) => record.lapId === analysis.fastestLapId && roleLapIds.has(record.lapId));
  const shortest = analysis.records.find((record) => record.lapId === analysis.shortestLapId && roleLapIds.has(record.lapId));
  const referenceRecord = analysis.records.find((record) => record.lapId === referenceLapId && roleLapIds.has(record.lapId));

  return (
    <section className="segment-trajectory-map" aria-label={t("lap.workbench.trajectoryComparison")}>
      <div className="segment-map-legend" aria-label={t("lap.workbench.trajectoryComparison")}>
        {focusedRecord ? (
          <span><i style={{ background: colorByLap.get(focusedRecord.lapId) }} />{t("lap.workbench.focusedLap")} · {t("lap.lap")} {focusedRecord.ordinal}</span>
        ) : null}
        {referenceRecord && referenceRecord.lapId !== focusedRecord?.lapId ? (
          <span><i className="is-reference" style={{ borderColor: colorByLap.get(referenceRecord.lapId) }} />{t("lap.workbench.referenceLap")} · {t("lap.lap")} {referenceRecord.ordinal}</span>
        ) : null}
      </div>
      <div className="segment-map-badges" aria-label={t("lap.workbench.pathRecords")}>
        {fastest ? <span className="status-chip fastest">{t("lap.workbench.fastestPath")} · {t("lap.lap")} {fastest.ordinal}</span> : null}
        {shortest ? <span className="status-chip shortest">{t("lap.workbench.shortestPath")} · {t("lap.lap")} {shortest.ordinal}</span> : null}
        {focusedRecord?.gpsConfidence === "low" ? <span className="status-chip warning">{t("lap.workbench.lowGpsHeatHidden")}</span> : null}
      </div>
      <RouteMap
        points={points}
        selectedIndex={selectedIndex}
        sourceVisibility={{ rawGps: true, enhancedGps: false }}
        settings={settings}
        segment={segment}
        region={region}
        trackCenterline={centerline}
        sectionCenterline={centerline}
        trackSections={sections}
        lapOverlays={lapOverlays}
        heatSegments={heatSegments}
        ghostMarkers={ghostMarkers}
        showRouteLine={false}
        showRoutePoints={false}
        interactiveRoutePoints
        interactionPoints={focusedInteractionPoints}
        onSectionSelect={onSectionSelect}
        onSelectedIndex={onSelectedIndex}
        onSegmentChange={onSegmentChange}
        onRegionChange={onRegionChange}
        onSettingsChange={onSettingsChange}
      />
    </section>
  );
}

function toGpsPoint(
  sample: SegmentLapRecord["trajectory"][number],
  source: GpsPoint | undefined,
): GpsPoint {
  return {
    index: sample.sourceIndex,
    lineNumber: source?.lineNumber ?? sample.sourceIndex + 1,
    rawLine: "",
    date: source?.date ?? "",
    time: source?.time ?? "",
    latitude: sample.latitude,
    longitude: sample.longitude,
    altitudeMeters: source?.altitudeMeters ?? 0,
    speedKmh: sample.speedKmh,
    bearingDegrees: source?.bearingDegrees ?? 0,
    satelliteCount: source?.satelliteCount ?? 0,
    accuracyMeters: sample.accuracyMeters,
    source: source?.source ?? "RawGps",
    confidence: source?.confidence ?? 0,
  };
}

function nearestSample(record: SegmentLapRecord, distanceMeters: number) {
  return record.trajectory.reduce((nearest, sample) =>
    !nearest || Math.abs(sample.distanceMeters - distanceMeters) < Math.abs(nearest.distanceMeters - distanceMeters)
      ? sample
      : nearest,
  undefined as SegmentLapRecord["trajectory"][number] | undefined);
}

function uniqueRecords(records: Array<SegmentLapRecord | undefined>): SegmentLapRecord[] {
  const seen = new Set<string>();
  return records.filter((record): record is SegmentLapRecord => {
    if (!record || seen.has(record.lapId)) return false;
    seen.add(record.lapId);
    return true;
  });
}

function pathLayerRank(lapId: string, focusedLapId?: string, referenceLapId?: string): number {
  if (lapId === focusedLapId) return 3;
  if (lapId === referenceLapId) return 2;
  return 1;
}

function lossRateColor(value: number): string {
  if (value >= 0.12) return "#b91c1c";
  if (value >= 0.04) return "#f97316";
  if (value > -0.04) return "#facc15";
  return "#0f9f8f";
}
