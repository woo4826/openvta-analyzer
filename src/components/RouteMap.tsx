import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon, Position } from "geojson";
import { normalizeSegment } from "../domain/analysis";
import { deriveTrackSectionGeometry, type TrackSectionGeometry } from "../domain/lapAnalysis";
import type { ActiveSegment, AxisAlignedRegion, GpsPoint, MapSettings, SourceVisibility, TrackGate, TrackSection } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { MapControls } from "./MapControls";
import type { LapMapLineStyle } from "../domain/lapMapLayers";

export interface LapMapOverlay {
  id: string;
  color: string;
  points: GpsPoint[];
  width?: number;
  opacity?: number;
  dashArray?: number[];
  lineStyle?: LapMapLineStyle;
}

export interface MapHeatSegment {
  id: string;
  coordinates: [Position, Position];
  color: string;
  width: number;
  opacity: number;
}

export interface MapGhostMarker {
  id: string;
  label: string;
  coordinate: Position;
  color: string;
}

export interface TrackSectionVisual {
  color: string;
  width?: number;
  opacity?: number;
}

const EMPTY_GATES: TrackGate[] = [];
const EMPTY_LAP_OVERLAYS: LapMapOverlay[] = [];
const EMPTY_TRACK_SECTIONS: TrackSection[] = [];
const EMPTY_SECTION_VISUALS: Record<string, TrackSectionVisual> = {};
const EMPTY_HEAT_SEGMENTS: MapHeatSegment[] = [];
const EMPTY_GHOST_MARKERS: MapGhostMarker[] = [];

interface RouteMapProps {
  points: GpsPoint[];
  selectedIndex: number;
  sourceVisibility: SourceVisibility;
  settings: MapSettings;
  segment?: ActiveSegment;
  region?: AxisAlignedRegion;
  trackCenterline?: LineString;
  sectionCenterline?: LineString;
  trackSections?: TrackSection[];
  gates?: TrackGate[];
  lapOverlays?: LapMapOverlay[];
  heatSegments?: MapHeatSegment[];
  ghostMarkers?: MapGhostMarker[];
  sectionVisuals?: Record<string, TrackSectionVisual>;
  showRoutePoints?: boolean;
  interactiveRoutePoints?: boolean;
  showRouteLine?: boolean;
  interactionPoints?: GpsPoint[];
  onSectionSelect?: (sectionId: string) => void;
  onSelectedIndex: (index: number) => void;
  onSegmentChange?: (segment?: ActiveSegment) => void;
  onRegionChange?: (region?: AxisAlignedRegion) => void;
  onSettingsChange: (settings: MapSettings) => void;
}

export function RouteMap({
  points,
  selectedIndex,
  sourceVisibility,
  settings,
  segment,
  region,
  trackCenterline,
  sectionCenterline,
  trackSections = EMPTY_TRACK_SECTIONS,
  gates = EMPTY_GATES,
  lapOverlays = EMPTY_LAP_OVERLAYS,
  heatSegments = EMPTY_HEAT_SEGMENTS,
  ghostMarkers = EMPTY_GHOST_MARKERS,
  sectionVisuals = EMPTY_SECTION_VISUALS,
  showRoutePoints = true,
  interactiveRoutePoints = showRoutePoints,
  showRouteLine = true,
  interactionPoints,
  onSectionSelect,
  onSelectedIndex,
  onSegmentChange,
  onRegionChange,
  onSettingsChange,
}: RouteMapProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const focusFrameRef = useRef<number>();
  const onSectionSelectRef = useRef(onSectionSelect);
  onSectionSelectRef.current = onSectionSelect;
  const bounds = useMemo(() => coordinateBounds(points), [points]);
  const segmentPoints = useMemo(() => selectedSegmentPoints(points, segment), [points, segment]);
  const routePolyline = useMemo(
    () => showRouteLine && bounds ? points.map((point) => toSvgPoint(point, bounds)).join(" ") : "",
    [bounds, points, showRouteLine],
  );
  const routePointEntries = useMemo(() => (interactionPoints ?? points).map((point, index) => ({
    point,
    selectionIndex: interactionPoints ? point.index : index,
  })), [interactionPoints, points]);
  const segmentPolyline = useMemo(() => bounds ? segmentPoints.map((point) => toSvgPoint(point, bounds)).join(" ") : "", [bounds, segmentPoints]);
  const regionRect = useMemo(() => bounds && region ? regionToSvgRect(region, bounds) : undefined, [bounds, region]);
  const trackPolyline = useMemo(
    () => bounds && trackCenterline ? trackCenterline.coordinates.map((coordinate) => toSvgCoordinate(coordinate, bounds)).join(" ") : "",
    [bounds, trackCenterline],
  );
  const sectionGeometry = useMemo(
    () => deriveTrackSectionGeometry(sectionCenterline ?? trackCenterline ?? { type: "LineString", coordinates: [] }, trackSections),
    [sectionCenterline, trackCenterline, trackSections],
  );
  const sectionPolylines = useMemo(
    () => bounds ? sectionGeometry.map((section) => ({
      ...section,
      visual: sectionVisuals[section.id],
      polyline: section.line.coordinates.map((coordinate) => toSvgCoordinate(coordinate, bounds)).join(" "),
    })) : [],
    [bounds, sectionGeometry, sectionVisuals],
  );
  const lapPolylines = useMemo(
    () => bounds ? lapOverlays.map((overlay) => ({
      ...overlay,
      polyline: overlay.points.map((point) => toSvgPoint(point, bounds)).join(" "),
    })) : [],
    [bounds, lapOverlays],
  );
  const heatPolylines = useMemo(
    () => bounds ? heatSegments.map((segment) => ({
      ...segment,
      polyline: segment.coordinates.map((coordinate) => toSvgCoordinate(coordinate, bounds)).join(" "),
    })) : [],
    [bounds, heatSegments],
  );
  const fallbackGhostMarkers = useMemo(
    () => bounds ? ghostMarkers.map((marker) => ({
      ...marker,
      position: toSvgCoordinateArray(marker.coordinate, bounds),
    })) : [],
    [bounds, ghostMarkers],
  );
  const gatePolylines = useMemo(
    () => bounds ? gates.map((gate) => ({
      id: gate.id,
      polyline: gate.line.coordinates.map((coordinate) => toSvgCoordinate(coordinate, bounds)).join(" "),
    })) : [],
    [bounds, gates],
  );
  const fallbackRoutePointMarkers = useMemo(() => mapFailed && bounds && interactiveRoutePoints ? routePointEntries.map(({ point, selectionIndex }) => {
    const [cx, cy] = toSvgPointArray(point, bounds);
    return (
      <circle
        key={`${point.source}-${point.index}-${point.lineNumber}`}
        data-testid={`route-hit-${selectionIndex}`}
        cx={cx}
        cy={cy}
        r={showRoutePoints ? settings.pointSize : 10}
        fill={showRoutePoints ? speedColor(point.speedKmh, settings.speedThresholds) : "transparent"}
        stroke={showRoutePoints ? "#0c1b22" : "transparent"}
        strokeWidth={showRoutePoints ? 1.5 : 0}
        onClick={() => onSelectedIndex(selectionIndex)}
        style={{ pointerEvents: "auto", cursor: "pointer" }}
      />
    );
  }) : [], [bounds, interactiveRoutePoints, mapFailed, onSelectedIndex, routePointEntries, settings.pointSize, settings.speedThresholds, showRoutePoints]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !points.length) {
      return;
    }
    setMapFailed(false);
    setStyleLoaded(false);
    try {
      const center: [number, number] = [points[0].longitude, points[0].latitude];
      const map = new maplibregl.Map({
        container: containerRef.current,
        center,
        zoom: 14,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [settings.tileUrl],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
      });
      let removed = false;
      const removeMap = () => {
        if (removed) {
          return;
        }
        removed = true;
        map.remove();
        if (mapRef.current === map) {
          mapRef.current = null;
        }
      };
      map.on("error", () => {
        setStyleLoaded(false);
        setMapFailed(true);
        removeMap();
      });
      map.on("styledata", () => {
        if (map.isStyleLoaded()) {
          setStyleLoaded(true);
        }
      });
      map.on("load", () => {
        setStyleLoaded(true);
        map.on("click", "route-points", (event) => {
          const rawIndex = event.features?.[0]?.properties?.index;
          const nextIndex = Number(rawIndex);
          if (Number.isInteger(nextIndex)) {
            onSelectedIndex(nextIndex);
          }
        });
        map.on("mouseenter", "route-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "route-points", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "track-sections", (event) => {
          const sectionId = event.features?.[0]?.properties?.id;
          if (typeof sectionId === "string") onSectionSelectRef.current?.(sectionId);
        });
        map.on("mouseenter", "track-sections", () => {
          if (onSectionSelectRef.current) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "track-sections", () => {
          map.getCanvas().style.cursor = "";
        });
      });
      mapRef.current = map;
      const fitTimer = window.setTimeout(() => fitRoute(), 350);
      return () => {
        window.clearTimeout(fitTimer);
        removeMap();
      };
    } catch {
      setStyleLoaded(false);
      setMapFailed(true);
    }
    // Only rebuild the MapLibre instance when the route appears or the tile source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, settings.tileUrl]);

  useEffect(() => {
    if (!mapRef.current || !styleLoaded) {
      return;
    }
    updateMapRoute(mapRef.current, points, routePointEntries, segment, region, settings, trackCenterline, gates, lapOverlays, heatSegments, ghostMarkers, sectionGeometry, sectionVisuals, showRouteLine, showRoutePoints, interactiveRoutePoints);
  }, [points, routePointEntries, segment, region, settings, styleLoaded, trackCenterline, gates, lapOverlays, heatSegments, ghostMarkers, sectionGeometry, sectionVisuals, showRouteLine, showRoutePoints, interactiveRoutePoints]);

  useEffect(() => {
    if (!mapRef.current || !styleLoaded) {
      return;
    }
    const selected = points[selectedIndex];
    if (focusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }
    focusFrameRef.current = window.requestAnimationFrame(() => {
      if (!mapRef.current) return;
      updateSelectedPoint(mapRef.current, selected);
      if (selected) {
        mapRef.current.jumpTo({
          center: [selected.longitude, selected.latitude],
        });
      }
    });
    return () => {
      if (focusFrameRef.current !== undefined) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
    };
  }, [points, selectedIndex, styleLoaded]);

  function fitRoute() {
    if (!mapRef.current || !points.length) {
      return;
    }
    if (points.length === 1) {
      mapRef.current.easeTo({
        center: [points[0].longitude, points[0].latitude],
        zoom: Math.max(mapRef.current.getZoom(), 16),
        duration: 250,
      });
      return;
    }
    const routeBounds = new maplibregl.LngLatBounds();
    points.forEach((point) => routeBounds.extend([point.longitude, point.latitude]));
    mapRef.current.fitBounds(routeBounds, { padding: 70, maxZoom: 16, duration: 250 });
  }

  function setSegmentStart() {
    setSegmentBoundary("startIndex");
  }

  function setSegmentEnd() {
    setSegmentBoundary("endIndex");
  }

  function setSegmentBoundary(boundary: "startIndex" | "endIndex") {
    if (!points.length || !onSegmentChange) {
      return;
    }
    const pointIndex = clampIndex(selectedIndex, points.length);
    const nextSegment = normalizeSegment(
      {
        startIndex: boundary === "startIndex" ? pointIndex : segment?.startIndex ?? pointIndex,
        endIndex: boundary === "endIndex" ? pointIndex : segment?.endIndex ?? pointIndex,
        source: "map",
      },
      points.length,
    );
    onSegmentChange(nextSegment);
  }

  function createRegion() {
    if (!bounds || !onRegionChange) {
      return;
    }
    onRegionChange({
      minLatitude: bounds.minLat,
      maxLatitude: bounds.maxLat,
      minLongitude: bounds.minLon,
      maxLongitude: bounds.maxLon,
    });
  }

  if (!points.length || !bounds) {
    return <div className="map-shell empty-state">{t("map.noGpsData")}</div>;
  }

  const selected = points[selectedIndex];
  return (
    <div className="map-shell" data-source-visibility={sourceVisibilityState(sourceVisibility)}>
      {!mapFailed ? <div className="map-container" ref={containerRef} /> : null}
      {mapFailed ? <div className="empty-state">{t("map.tilesUnavailable")}</div> : null}
      {mapFailed ? (
        <svg className="coordinate-layer" viewBox="0 0 1000 640" role="img" aria-label={t("map.speedColoredRoutePlot")}>
          {regionRect ? (
            <rect
              x={regionRect.x}
              y={regionRect.y}
              width={regionRect.width}
              height={regionRect.height}
              fill="#2b6cb0"
              fillOpacity="0.14"
              stroke="#2b6cb0"
              strokeWidth="3"
              strokeDasharray="10 8"
            />
          ) : null}
          <polyline
            points={routePolyline}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.9"
            strokeWidth="11"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {trackPolyline ? (
            <polyline
              points={trackPolyline}
              fill="none"
              stroke="#2b6cb0"
              strokeOpacity="0.75"
              strokeWidth="3"
              strokeDasharray="12 8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {sectionPolylines.map((section) => section.polyline ? (
            <polyline
              key={section.id}
              data-testid={`track-section-${section.id}`}
              points={section.polyline}
              fill="none"
              stroke={section.visual?.color ?? trackSectionColor(section.kind)}
              strokeOpacity={section.visual?.opacity ?? 0.92}
              strokeWidth={section.visual?.width ?? 8}
              strokeLinejoin="round"
              strokeLinecap="round"
              role={onSectionSelect ? "button" : undefined}
              tabIndex={onSectionSelect ? 0 : undefined}
              aria-label={onSectionSelect ? section.name : undefined}
              onClick={() => onSectionSelect?.(section.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSectionSelect?.(section.id);
                }
              }}
              style={onSectionSelect ? { cursor: "pointer" } : undefined}
            />
          ) : null)}
          {lapPolylines.map((overlay) => overlay.polyline ? (
            <polyline
              key={overlay.id}
              data-testid={`lap-overlay-${overlay.id}`}
              points={overlay.polyline}
              fill="none"
              stroke={overlay.color}
              strokeOpacity={overlay.opacity ?? 0.9}
              strokeWidth={overlay.width ?? 7}
              strokeDasharray={overlay.dashArray?.join(" ")}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null)}
          {heatPolylines.map((heat) => (
            <polyline
              key={heat.id}
              data-testid={`loss-rate-${heat.id}`}
              points={heat.polyline}
              fill="none"
              stroke={heat.color}
              strokeOpacity={heat.opacity}
              strokeWidth={heat.width}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {gatePolylines.map((gate) => (
            <polyline
              key={gate.id}
              points={gate.polyline}
              fill="none"
              stroke="#7c3aed"
              strokeWidth="8"
              strokeLinecap="round"
            />
          ))}
          <polyline
            points={routePolyline}
            fill="none"
            stroke="#0f3440"
            strokeOpacity="0.78"
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {segmentPolyline ? (
            <>
              <polyline
                points={segmentPolyline}
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.95"
                strokeWidth="14"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={segmentPolyline}
                fill="none"
                stroke="#be3b3b"
                strokeOpacity="0.96"
                strokeWidth="8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : null}
          {fallbackRoutePointMarkers}
          {fallbackGhostMarkers.map((marker) => (
            <g key={marker.id} role="img" aria-label={marker.label}>
              <circle cx={marker.position[0]} cy={marker.position[1]} r="12" fill="#ffffff" stroke={marker.color} strokeWidth="4" />
              <circle cx={marker.position[0]} cy={marker.position[1]} r="5" fill={marker.color} stroke="#ffffff" strokeWidth="1.5" />
            </g>
          ))}
          {selected ? (
            <SelectedPointMarker point={selected} bounds={bounds} pointSize={settings.pointSize} />
          ) : null}
        </svg>
      ) : (
        <div className="coordinate-layer" aria-label={t("map.speedColoredRoutePlot")} role="img" />
      )}
      <MapControls
        settings={settings}
        hasPoints={points.length > 0}
        hasSegment={Boolean(segment)}
        onFitRoute={fitRoute}
        onSetSegmentStart={onSegmentChange ? setSegmentStart : undefined}
        onSetSegmentEnd={onSegmentChange ? setSegmentEnd : undefined}
        onClearSegment={onSegmentChange ? () => onSegmentChange(undefined) : undefined}
        onCreateRegion={onRegionChange ? createRegion : undefined}
        onSettingsChange={onSettingsChange}
      />
      <div className="map-attribution">© OpenStreetMap contributors</div>
    </div>
  );
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

type CoordinatePair = [number, number];
type SpeedColorExpression = [
  "step",
  ["get", "speedKmh"],
  string,
  number,
  string,
  number,
  string,
  number,
  string,
  number,
  string,
];
type MapGeoJsonData =
  | Feature<LineString>
  | FeatureCollection<Point>
  | FeatureCollection<LineString>
  | FeatureCollection<Polygon>;

function SelectedPointMarker({ point, bounds, pointSize }: { point: GpsPoint; bounds: Bounds; pointSize: number }) {
  const [cx, cy] = toSvgPointArray(point, bounds);
  return (
    <>
      <circle cx={cx} cy={cy} r={Math.max(pointSize + 5, 10)} fill="#ffffff" stroke="#0c1b22" strokeWidth="3.5" />
      <circle cx={cx} cy={cy} r={Math.max(pointSize - 1, 4)} fill="#f8961e" stroke="#ffffff" strokeWidth="1.5" />
    </>
  );
}

function coordinateBounds(points: GpsPoint[]): Bounds | undefined {
  if (!points.length) {
    return undefined;
  }
  return {
    minLat: Math.min(...points.map((point) => point.latitude)),
    maxLat: Math.max(...points.map((point) => point.latitude)),
    minLon: Math.min(...points.map((point) => point.longitude)),
    maxLon: Math.max(...points.map((point) => point.longitude)),
  };
}

function selectedSegmentPoints(points: GpsPoint[], segment?: ActiveSegment): GpsPoint[] {
  if (!segment || !points.length) {
    return [];
  }
  const normalized = normalizeSegment(segment, points.length);
  return points.slice(normalized.startIndex, normalized.endIndex + 1);
}

function toSvgPoint(point: Coordinate, bounds: Bounds): string {
  const [x, y] = toSvgPointArray(point, bounds);
  return `${x},${y}`;
}

function toSvgPointArray(point: Coordinate, bounds: Bounds): [number, number] {
  const lonRange = bounds.maxLon - bounds.minLon || 1;
  const latRange = bounds.maxLat - bounds.minLat || 1;
  const x = 60 + ((point.longitude - bounds.minLon) / lonRange) * 880;
  const y = 580 - ((point.latitude - bounds.minLat) / latRange) * 520;
  return [x, y];
}

function toSvgCoordinate(coordinate: number[], bounds: Bounds): string {
  return toSvgPoint({ longitude: coordinate[0], latitude: coordinate[1] }, bounds);
}

function toSvgCoordinateArray(coordinate: number[], bounds: Bounds): [number, number] {
  return toSvgPointArray({ longitude: coordinate[0], latitude: coordinate[1] }, bounds);
}

function regionToSvgRect(region: AxisAlignedRegion, bounds: Bounds) {
  const normalized = normalizeRegion(region);
  const [x1, y1] = toSvgPointArray({ latitude: normalized.maxLatitude, longitude: normalized.minLongitude }, bounds);
  const [x2, y2] = toSvgPointArray({ latitude: normalized.minLatitude, longitude: normalized.maxLongitude }, bounds);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function speedColor(speedKmh: number, thresholds: MapSettings["speedThresholds"]): string {
  const [slow, medium, fast, veryFast] = normalizeThresholds(thresholds);
  if (speedKmh < slow) return "#2aa876";
  if (speedKmh < medium) return "#76b947";
  if (speedKmh < fast) return "#ffd166";
  if (speedKmh < veryFast) return "#f8961e";
  return "#d62828";
}

function updateMapRoute(
  map: maplibregl.Map,
  points: GpsPoint[],
  routePointEntries: Array<{ point: GpsPoint; selectionIndex: number }>,
  segment: ActiveSegment | undefined,
  region: AxisAlignedRegion | undefined,
  settings: MapSettings,
  trackCenterline: LineString | undefined,
  gates: TrackGate[],
  lapOverlays: LapMapOverlay[],
  heatSegments: MapHeatSegment[],
  ghostMarkers: MapGhostMarker[],
  sectionGeometry: TrackSectionGeometry[],
  sectionVisuals: Record<string, TrackSectionVisual>,
  showRouteLine: boolean,
  showRoutePoints: boolean,
  interactiveRoutePoints: boolean,
) {
  if (!map.isStyleLoaded() || !points.length) {
    return;
  }
  const routeData: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: showRouteLine && points.length >= 2 ? [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: lineCoordinates(points),
      },
    }] : [],
  };
  const segmentCoordinates = lineCoordinates(selectedSegmentPoints(points, segment));
  const segmentData: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: segmentCoordinates.length
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: segmentCoordinates },
          },
        ]
      : [],
  };
  const pointData: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: showRoutePoints || interactiveRoutePoints ? routePointEntries.map(({ point, selectionIndex }) => ({
      type: "Feature",
      properties: { index: selectionIndex, speedKmh: point.speedKmh },
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
    })) : [],
  };
  const selectedData: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [],
  };
  const regionData: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: region
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: regionCoordinates(region) },
          },
        ]
      : [],
  };
  const trackData: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: trackCenterline ? [{ type: "Feature", properties: {}, geometry: trackCenterline }] : [],
  };
  const lapData: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: lapOverlays.filter((overlay) => overlay.points.length >= 2).map((overlay) => ({
      type: "Feature",
      properties: {
        id: overlay.id,
        color: overlay.color,
        width: overlay.width ?? 6,
        opacity: overlay.opacity ?? 0.86,
        dashArray: overlay.dashArray ?? [],
        lineStyle: overlay.lineStyle ?? (overlay.dashArray?.length ? "dashed" : "solid"),
      },
      geometry: { type: "LineString", coordinates: lineCoordinates(overlay.points) },
    })),
  };
  const heatData: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: heatSegments.map((heat) => ({
      type: "Feature",
      properties: { id: heat.id, color: heat.color, width: heat.width, opacity: heat.opacity },
      geometry: { type: "LineString", coordinates: heat.coordinates },
    })),
  };
  const ghostData: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: ghostMarkers.map((marker) => ({
      type: "Feature",
      properties: { id: marker.id, label: marker.label, color: marker.color },
      geometry: { type: "Point", coordinates: marker.coordinate },
    })),
  };
  const sectionData: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: sectionGeometry.map((section) => ({
      type: "Feature",
      properties: {
        id: section.id,
        name: section.name,
        kind: section.kind,
        color: sectionVisuals[section.id]?.color ?? trackSectionColor(section.kind),
        width: sectionVisuals[section.id]?.width ?? 8,
        opacity: sectionVisuals[section.id]?.opacity ?? 0.92,
      },
      geometry: section.line,
    })),
  };
  const gateData: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: gates.map((gate) => ({
      type: "Feature",
      properties: { id: gate.id },
      geometry: gate.line,
    })),
  };

  setGeoJsonSource(map, "region-source", regionData);
  setGeoJsonSource(map, "route-line-source", routeData);
  setGeoJsonSource(map, "segment-line-source", segmentData);
  setGeoJsonSource(map, "route-points-source", pointData);
  setGeoJsonSource(map, "track-centerline-source", trackData);
  setGeoJsonSource(map, "track-section-source", sectionData);
  setGeoJsonSource(map, "lap-overlay-source", lapData);
  setGeoJsonSource(map, "loss-rate-segment-source", heatData);
  setGeoJsonSource(map, "ghost-marker-source", ghostData);
  setGeoJsonSource(map, "gate-source", gateData);
  if (!map.getSource("selected-point-source")) {
    setGeoJsonSource(map, "selected-point-source", selectedData);
  }

  if (!map.getLayer("region-fill")) {
    map.addLayer({
      id: "region-fill",
      type: "fill",
      source: "region-source",
      paint: {
        "fill-color": "#2b6cb0",
        "fill-opacity": 0.14,
      },
    });
  }
  if (!map.getLayer("region-outline")) {
    map.addLayer({
      id: "region-outline",
      type: "line",
      source: "region-source",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#2b6cb0",
        "line-width": 3,
        "line-opacity": 0.9,
        "line-dasharray": [2, 1.5],
      },
    });
  }
  if (!map.getLayer("route-line-halo")) {
    map.addLayer({
      id: "route-line-halo",
      type: "line",
      source: "route-line-source",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#ffffff",
        "line-width": 10,
        "line-opacity": 0.92,
      },
    });
  }
  if (!map.getLayer("route-line")) {
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line-source",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#0f3440",
        "line-width": 5,
        "line-opacity": 0.88,
      },
    });
  }
  if (!map.getLayer("segment-line-halo")) {
    map.addLayer({
      id: "segment-line-halo",
      type: "line",
      source: "segment-line-source",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#ffffff",
        "line-width": 14,
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("track-centerline")) {
    map.addLayer({
      id: "track-centerline",
      type: "line",
      source: "track-centerline-source",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#2b6cb0", "line-width": 3, "line-opacity": 0.75, "line-dasharray": [2, 1.5] },
    });
  }
  if (!map.getLayer("track-sections")) {
    map.addLayer({
      id: "track-sections",
      type: "line",
      source: "track-section-source",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": ["get", "opacity"] },
    });
  }
  const lapLineStyles = [
    { id: "solid", dashArray: undefined },
    { id: "dashed", dashArray: [4, 3] },
    { id: "dotted", dashArray: [1, 2.2] },
  ] as const;
  lapLineStyles.forEach(({ id, dashArray }) => {
    const layerId = `lap-overlays-${id}`;
    if (map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: "line",
      source: "lap-overlay-source",
      filter: ["==", ["get", "lineStyle"], id],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["get", "width"],
        "line-opacity": ["get", "opacity"],
        ...(dashArray ? { "line-dasharray": [...dashArray] } : {}),
      },
    });
  });
  if (!map.getLayer("loss-rate-segments")) {
    map.addLayer({
      id: "loss-rate-segments",
      type: "line",
      source: "loss-rate-segment-source",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": ["get", "opacity"] },
    });
  }
  if (!map.getLayer("ghost-markers")) {
    map.addLayer({
      id: "ghost-markers",
      type: "circle",
      source: "ghost-marker-source",
      paint: {
        "circle-radius": 8,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    });
  }
  if (!map.getLayer("timing-gates")) {
    map.addLayer({
      id: "timing-gates",
      type: "line",
      source: "gate-source",
      layout: { "line-cap": "round" },
      paint: { "line-color": "#7c3aed", "line-width": 7, "line-opacity": 0.95 },
    });
  }
  if (!map.getLayer("segment-line")) {
    map.addLayer({
      id: "segment-line",
      type: "line",
      source: "segment-line-source",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#be3b3b",
        "line-width": 8,
        "line-opacity": 0.96,
      },
    });
  }
  if (!map.getLayer("route-points")) {
    map.addLayer({
      id: "route-points",
      type: "circle",
      source: "route-points-source",
      paint: {
        "circle-radius": settings.pointSize,
        "circle-color": speedColorExpression(settings.speedThresholds),
        "circle-stroke-color": "#0c1b22",
        "circle-stroke-width": 1.75,
      },
    });
  }
  if (!map.getLayer("selected-point")) {
    map.addLayer({
      id: "selected-point",
      type: "circle",
      source: "selected-point-source",
      paint: {
        "circle-radius": Math.max(settings.pointSize + 5, 10),
        "circle-color": "#ffffff",
        "circle-stroke-color": "#0c1b22",
        "circle-stroke-width": 3.5,
      },
    });
  }
  if (!map.getLayer("selected-point-core")) {
    map.addLayer({
      id: "selected-point-core",
      type: "circle",
      source: "selected-point-source",
      paint: {
        "circle-radius": Math.max(settings.pointSize - 1, 4),
        "circle-color": "#f8961e",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
  }

  map.setPaintProperty("route-points", "circle-radius", showRoutePoints ? settings.pointSize : 10);
  map.setPaintProperty("route-points", "circle-color", speedColorExpression(settings.speedThresholds));
  map.setPaintProperty("route-points", "circle-opacity", showRoutePoints ? 1 : 0);
  map.setPaintProperty("route-points", "circle-stroke-opacity", showRoutePoints ? 1 : 0);
  map.setPaintProperty("selected-point", "circle-radius", Math.max(settings.pointSize + 5, 10));
  map.setPaintProperty("selected-point-core", "circle-radius", Math.max(settings.pointSize - 1, 4));
}

function updateSelectedPoint(map: maplibregl.Map, selected?: GpsPoint) {
  const selectedData: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: selected
      ? [{
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [selected.longitude, selected.latitude] },
        }]
      : [],
  };
  setGeoJsonSource(map, "selected-point-source", selectedData);
}

function lineCoordinates(points: GpsPoint[]): CoordinatePair[] {
  const coordinates = points.map((point): CoordinatePair => [point.longitude, point.latitude]);
  if (coordinates.length === 1) {
    return [coordinates[0], coordinates[0]];
  }
  return coordinates;
}

function regionCoordinates(region: AxisAlignedRegion): CoordinatePair[][] {
  const normalized = normalizeRegion(region);
  return [
    [
      [normalized.minLongitude, normalized.minLatitude],
      [normalized.maxLongitude, normalized.minLatitude],
      [normalized.maxLongitude, normalized.maxLatitude],
      [normalized.minLongitude, normalized.maxLatitude],
      [normalized.minLongitude, normalized.minLatitude],
    ],
  ];
}

function speedColorExpression(thresholds: MapSettings["speedThresholds"]): SpeedColorExpression {
  const [slow, medium, fast, veryFast] = normalizeThresholds(thresholds);
  return [
    "step",
    ["get", "speedKmh"],
    "#2aa876",
    slow,
    "#76b947",
    medium,
    "#ffd166",
    fast,
    "#f8961e",
    veryFast,
    "#d62828",
  ];
}

function normalizeThresholds(thresholds: MapSettings["speedThresholds"]): MapSettings["speedThresholds"] {
  const sorted = [...thresholds].sort((left, right) => left - right);
  return [sorted[0], sorted[1], sorted[2], sorted[3]];
}

function normalizeRegion(region: AxisAlignedRegion): AxisAlignedRegion {
  return {
    minLatitude: Math.min(region.minLatitude, region.maxLatitude),
    maxLatitude: Math.max(region.minLatitude, region.maxLatitude),
    minLongitude: Math.min(region.minLongitude, region.maxLongitude),
    maxLongitude: Math.max(region.minLongitude, region.maxLongitude),
  };
}

function clampIndex(value: number, pointCount: number): number {
  if (pointCount <= 0) {
    return 0;
  }
  const index = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(pointCount - 1, Math.max(0, index));
}

function sourceVisibilityState(sourceVisibility: SourceVisibility): string {
  if (sourceVisibility.rawGps && sourceVisibility.enhancedGps) {
    return "raw-enhanced";
  }
  if (sourceVisibility.rawGps) {
    return "raw";
  }
  if (sourceVisibility.enhancedGps) {
    return "enhanced";
  }
  return "none";
}

function trackSectionColor(kind: TrackSection["kind"]): string {
  if (kind === "corner-left") return "#dc2626";
  if (kind === "corner-right") return "#f59e0b";
  return "#0891b2";
}

function setGeoJsonSource(map: maplibregl.Map, sourceId: string, data: MapGeoJsonData) {
  const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(sourceId, {
    type: "geojson",
    data,
  });
}
