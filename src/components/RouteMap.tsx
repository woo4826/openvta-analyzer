import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import { normalizeSegment } from "../domain/analysis";
import type { ActiveSegment, AxisAlignedRegion, GpsPoint, MapSettings, SourceVisibility } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { MapControls } from "./MapControls";

interface RouteMapProps {
  points: GpsPoint[];
  selectedIndex: number;
  sourceVisibility: SourceVisibility;
  settings: MapSettings;
  segment?: ActiveSegment;
  region?: AxisAlignedRegion;
  onSelectedIndex: (index: number) => void;
  onSegmentChange: (segment?: ActiveSegment) => void;
  onRegionChange: (region?: AxisAlignedRegion) => void;
  onSettingsChange: (settings: MapSettings) => void;
}

export function RouteMap({
  points,
  selectedIndex,
  sourceVisibility,
  settings,
  segment,
  region,
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
  const bounds = useMemo(() => coordinateBounds(points), [points]);
  const segmentPoints = useMemo(() => selectedSegmentPoints(points, segment), [points, segment]);
  const routePolyline = useMemo(() => bounds ? points.map((point) => toSvgPoint(point, bounds)).join(" ") : "", [bounds, points]);
  const segmentPolyline = useMemo(() => bounds ? segmentPoints.map((point) => toSvgPoint(point, bounds)).join(" ") : "", [bounds, segmentPoints]);
  const regionRect = useMemo(() => bounds && region ? regionToSvgRect(region, bounds) : undefined, [bounds, region]);
  const fallbackRoutePointMarkers = useMemo(() => mapFailed && bounds ? points.map((point, index) => {
    const [cx, cy] = toSvgPointArray(point, bounds);
    return (
      <circle
        key={`${point.source}-${point.index}-${point.lineNumber}`}
        cx={cx}
        cy={cy}
        r={settings.pointSize}
        fill={speedColor(point.speedKmh, settings.speedThresholds)}
        stroke="#0c1b22"
        strokeWidth="1.5"
        onClick={() => onSelectedIndex(index)}
        style={{ pointerEvents: "auto", cursor: "pointer" }}
      />
    );
  }) : [], [bounds, mapFailed, onSelectedIndex, points, settings.pointSize, settings.speedThresholds]);

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
    updateMapRoute(mapRef.current, points, segment, region, settings);
  }, [points, segment, region, settings, styleLoaded]);

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
    if (!points.length) {
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
    if (!bounds) {
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
        onSetSegmentStart={setSegmentStart}
        onSetSegmentEnd={setSegmentEnd}
        onClearSegment={() => onSegmentChange(undefined)}
        onCreateRegion={createRegion}
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
  segment: ActiveSegment | undefined,
  region: AxisAlignedRegion | undefined,
  settings: MapSettings,
) {
  if (!map.isStyleLoaded() || !points.length) {
    return;
  }
  const routeData: Feature<LineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: lineCoordinates(points),
    },
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
    features: points.map((point, index) => ({
      type: "Feature",
      properties: { index, speedKmh: point.speedKmh },
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
    })),
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

  setGeoJsonSource(map, "region-source", regionData);
  setGeoJsonSource(map, "route-line-source", routeData);
  setGeoJsonSource(map, "segment-line-source", segmentData);
  setGeoJsonSource(map, "route-points-source", pointData);
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

  map.setPaintProperty("route-points", "circle-radius", settings.pointSize);
  map.setPaintProperty("route-points", "circle-color", speedColorExpression(settings.speedThresholds));
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
