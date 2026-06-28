import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { RotateCcw, ScanLine } from "lucide-react";
import type { GpsPoint } from "../domain/types";

interface RouteMapProps {
  points: GpsPoint[];
  selectedIndex: number;
  onSelectedIndex: (index: number) => void;
}

export function RouteMap({ points, selectedIndex, onSelectedIndex }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const bounds = useMemo(() => coordinateBounds(points), [points]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !points.length) {
      return;
    }
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
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
      });
      map.on("error", () => setMapFailed(true));
      map.on("load", () => {
        updateMapRoute(map, points, selectedIndex);
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
      setTimeout(() => fitRoute(), 350);
    } catch {
      setMapFailed(true);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  useEffect(() => {
    if (mapRef.current && points[selectedIndex]) {
      updateMapRoute(mapRef.current, points, selectedIndex);
      mapRef.current.easeTo({
        center: [points[selectedIndex].longitude, points[selectedIndex].latitude],
        duration: 250,
      });
    }
  }, [points, selectedIndex]);

  function fitRoute() {
    if (!mapRef.current || !points.length) {
      return;
    }
    const routeBounds = new maplibregl.LngLatBounds();
    points.forEach((point) => routeBounds.extend([point.longitude, point.latitude]));
    mapRef.current.fitBounds(routeBounds, { padding: 70, maxZoom: 16, duration: 250 });
  }

  if (!points.length || !bounds) {
    return <div className="map-shell empty-state">No GPS data available for mapping.</div>;
  }

  return (
    <div className="map-shell">
      {!mapFailed ? <div className="map-container" ref={containerRef} /> : null}
      {mapFailed ? <div className="empty-state">Map tiles unavailable. Showing coordinate plot.</div> : null}
      {mapFailed ? (
        <svg className="coordinate-layer" viewBox="0 0 1000 640" role="img" aria-label="Speed-colored route plot">
          <polyline
            points={points.map((point) => toSvgPoint(point, bounds)).join(" ")}
            fill="none"
            stroke="#0f3440"
            strokeOpacity="0.68"
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point, index) => {
            const [cx, cy] = toSvgPointArray(point, bounds);
            return (
              <circle
                key={`${point.source}-${point.index}-${point.lineNumber}`}
                cx={cx}
                cy={cy}
                r={index === selectedIndex ? 10 : 6}
                fill={speedColor(point.speedKmh)}
                stroke="#0c1b22"
                strokeWidth={index === selectedIndex ? 2.5 : 1.5}
                onClick={() => onSelectedIndex(index)}
                style={{ pointerEvents: "auto", cursor: "pointer" }}
              />
            );
          })}
        </svg>
      ) : (
        <div
          className="coordinate-layer"
          aria-label="Speed-colored route plot"
          role="img"
        />
      )}
      <div className="map-toolbar">
        <button className="button" type="button" onClick={fitRoute} title="Fit route">
          <ScanLine size={15} aria-hidden />
        </button>
        <button className="button" type="button" onClick={() => onSelectedIndex(0)} title="Select first point">
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>
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

function toSvgPoint(point: GpsPoint, bounds: Bounds): string {
  const [x, y] = toSvgPointArray(point, bounds);
  return `${x},${y}`;
}

function toSvgPointArray(point: GpsPoint, bounds: Bounds): [number, number] {
  const lonRange = bounds.maxLon - bounds.minLon || 1;
  const latRange = bounds.maxLat - bounds.minLat || 1;
  const x = 60 + ((point.longitude - bounds.minLon) / lonRange) * 880;
  const y = 580 - ((point.latitude - bounds.minLat) / latRange) * 520;
  return [x, y];
}

function speedColor(speedKmh: number): string {
  if (speedKmh < 10) return "#2aa876";
  if (speedKmh < 30) return "#76b947";
  if (speedKmh < 50) return "#ffd166";
  if (speedKmh < 80) return "#f8961e";
  return "#d62828";
}

function updateMapRoute(map: maplibregl.Map, points: GpsPoint[], selectedIndex: number) {
  if (!map.isStyleLoaded() || !points.length) {
    return;
  }
  const routeData: Feature<LineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: points.map((point) => [point.longitude, point.latitude]),
    },
  };
  const pointData: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: points.map((point, index) => ({
      type: "Feature",
      properties: { index, speedKmh: point.speedKmh, selected: index === selectedIndex },
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
    })),
  };
  const selected = points[selectedIndex];
  const selectedData: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: selected
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [selected.longitude, selected.latitude] },
          },
        ]
      : [],
  };

  setGeoJsonSource(map, "route-line-source", routeData);
  setGeoJsonSource(map, "route-points-source", pointData);
  setGeoJsonSource(map, "selected-point-source", selectedData);

  if (!map.getLayer("route-line-halo")) {
    map.addLayer({
      id: "route-line-halo",
      type: "line",
      source: "route-line-source",
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
      paint: {
        "line-color": "#0f3440",
        "line-width": 5,
        "line-opacity": 0.9,
      },
    });
  }
  if (!map.getLayer("route-points")) {
    map.addLayer({
      id: "route-points",
      type: "circle",
      source: "route-points-source",
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "step",
          ["get", "speedKmh"],
          "#2aa876",
          10,
          "#76b947",
          30,
          "#ffd166",
          50,
          "#f8961e",
          80,
          "#d62828",
        ],
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
        "circle-radius": 11,
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
        "circle-radius": 5,
        "circle-color": "#f8961e",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
  }
}

function setGeoJsonSource(
  map: maplibregl.Map,
  sourceId: string,
  data: Feature<LineString> | FeatureCollection<Point>,
) {
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
