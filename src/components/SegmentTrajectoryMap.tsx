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
  buildLapMapLayers,
  type LapMapLayerOverride,
  type LapMapLayerOverrides,
} from "../domain/lapMapLayers";
import {
  RouteMap,
  type LapMapOverlay,
  type MapGhostMarker,
} from "./RouteMap";
import { useI18n } from "../i18n/useI18n";
import { SegmentLapLayerControls } from "./SegmentLapLayerControls";

const EMPTY_LAYER_OVERRIDES: LapMapLayerOverrides = {};

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
  lapLayerOverrides?: LapMapLayerOverrides;
  onLapLayerOverrides?: (overrides: LapMapLayerOverrides) => void;
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
  onSegmentChange,
  onRegionChange,
  onSettingsChange = () => undefined,
  lapLayerOverrides = EMPTY_LAYER_OVERRIDES,
  onLapLayerOverrides = () => undefined,
}: SegmentTrajectoryMapProps) {
  const { t } = useI18n();
  const roleLapIds = useMemo(() => new Set(
    [focusedLapId, referenceLapId].filter((lapId): lapId is string => Boolean(lapId)),
  ), [focusedLapId, referenceLapId]);
  const layers = useMemo(() => buildLapMapLayers(
    analysis.records,
    focusedLapId,
    referenceLapId,
    lapLayerOverrides,
  ), [analysis.records, focusedLapId, lapLayerOverrides, referenceLapId]);
  const colorByLap = useMemo(() => new Map(layers.map((layer) => [layer.id, layer.color])), [layers]);
  const recordsById = useMemo(() => new Map(analysis.records.map((record) => [record.lapId, record])), [analysis.records]);
  const lapOverlays = useMemo((): LapMapOverlay[] => layers
    .filter((layer) => layer.visible)
    .sort((left, right) => roleLayerRank(left.role) - roleLayerRank(right.role))
    .flatMap((layer) => {
      const record = recordsById.get(layer.id);
      if (!record) return [];
      return [{
        id: record.lapId,
        color: layer.color,
        points: record.trajectory.map((sample) => toGpsPoint(sample, points[sample.sourceIndex])),
        width: layer.width,
        opacity: layer.opacity,
        lineStyle: layer.lineStyle,
        dashArray: lineStyleDashArray(layer.lineStyle),
      }];
    }), [layers, points, recordsById]);

  const focusedRecord = analysis.records.find((record) => record.lapId === focusedLapId && roleLapIds.has(record.lapId));
  const focusedInteractionPoints = useMemo(
    () => focusedRecord?.trajectory.map((sample) => toGpsPoint(sample, points[sample.sourceIndex])) ?? [],
    [focusedRecord, points],
  );
  const invisibleSectionVisuals = useMemo(() => Object.fromEntries(sections.map((section) => [section.id, {
    color: "#000000",
    width: 18,
    opacity: 0,
  }])), [sections]);

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
  const updateLayer = (lapId: string, update: LapMapLayerOverride) => {
    onLapLayerOverrides({
      ...lapLayerOverrides,
      [lapId]: { ...lapLayerOverrides[lapId], ...update },
    });
  };
  const setLayerVisibility = (predicate: (role: (typeof layers)[number]["role"]) => boolean) => {
    onLapLayerOverrides(Object.fromEntries(layers.map((layer) => [layer.id, {
      ...lapLayerOverrides[layer.id],
      visible: predicate(layer.role),
    }])));
  };

  return (
    <section className="segment-trajectory-map" aria-label={t("lap.workbench.trajectoryComparison")}>
      <SegmentLapLayerControls
        layers={layers}
        onLayer={updateLayer}
        onShowComparison={() => setLayerVisibility((role) => role !== "other")}
        onShowAll={() => setLayerVisibility(() => true)}
        onReset={() => onLapLayerOverrides({})}
      />
      <div className="segment-map-badges" aria-label={t("lap.workbench.pathRecords")}>
        {fastest ? <span className="status-chip fastest">{t("lap.workbench.fastestPath")} · {t("lap.lap")} {fastest.ordinal}</span> : null}
        {shortest ? <span className="status-chip shortest">{t("lap.workbench.shortestPath")} · {t("lap.lap")} {shortest.ordinal}</span> : null}
      </div>
      <RouteMap
        points={points}
        selectedIndex={selectedIndex}
        sourceVisibility={{ rawGps: true, enhancedGps: false }}
        settings={settings}
        segment={segment}
        region={region}
        sectionCenterline={centerline}
        trackSections={sections}
        sectionVisuals={invisibleSectionVisuals}
        lapOverlays={lapOverlays}
        ghostMarkers={ghostMarkers}
        showRouteLine={false}
        showRoutePoints={false}
        interactiveRoutePoints
        interactionPoints={focusedInteractionPoints}
        fitPoints={focusedInteractionPoints}
        followSelectedPoint={false}
        mapAriaLabel={t("lap.workbench.trajectoryComparison")}
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

function roleLayerRank(role: "focused" | "reference" | "other"): number {
  if (role === "focused") return 3;
  if (role === "reference") return 2;
  return 1;
}

function lineStyleDashArray(style: "solid" | "dashed" | "dotted"): number[] | undefined {
  if (style === "dashed") return [4, 3];
  if (style === "dotted") return [1, 2.2];
  return undefined;
}
