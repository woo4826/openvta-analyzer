import { render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveSegment, GpsPoint, MapSettings } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { RouteMap } from "../RouteMap";

const mapMock = vi.hoisted(() => {
  class SourceDouble {
    setData = vi.fn();
  }

  class MapDouble {
    static instances: MapDouble[] = [];
    static shouldThrow = false;
    sources = new Map<string, SourceDouble>();
    layers = new Set<string>();
    layerDefinitions = new Map<string, { id: string; filter?: unknown; paint?: Record<string, unknown> }>();
    jumpTo = vi.fn();
    easeTo = vi.fn();
    fitBounds = vi.fn();
    setPaintProperty = vi.fn();
    remove = vi.fn();

    constructor() {
      if (MapDouble.shouldThrow) throw new Error("map unavailable");
      MapDouble.instances.push(this);
    }

    on(event: string, layerOrHandler: string | (() => void), handler?: () => void) {
      if (event === "load" && typeof layerOrHandler === "function") {
        queueMicrotask(layerOrHandler);
      }
      void handler;
      return this;
    }

    isStyleLoaded() {
      return true;
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    addSource(id: string, source: { data?: unknown }) {
      const next = new SourceDouble();
      this.sources.set(id, next);
      if (source.data) next.setData(source.data);
    }

    getLayer(id: string) {
      return this.layers.has(id) ? { id } : undefined;
    }

    addLayer(layer: { id: string; filter?: unknown; paint?: Record<string, unknown> }) {
      this.layers.add(layer.id);
      this.layerDefinitions.set(layer.id, layer);
    }

    getCanvas() {
      return { style: { cursor: "" } };
    }

    getZoom() {
      return 14;
    }
  }

  class LngLatBoundsDouble {
    coordinates: number[][] = [];

    extend(coordinate: number[]) {
      this.coordinates.push(coordinate);
      return this;
    }
  }

  return { MapDouble, LngLatBoundsDouble };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: mapMock.MapDouble,
    LngLatBounds: mapMock.LngLatBoundsDouble,
  },
}));

const points = [point(0), point(1), point(2)];
const settings: MapSettings = {
  pointSize: 6,
  tileUrl: "https://tiles.invalid/{z}/{x}/{y}.png",
  speedThresholds: [10, 30, 50, 80],
};

describe("RouteMap source updates", () => {
  beforeEach(() => {
    mapMock.MapDouble.instances.length = 0;
    mapMock.MapDouble.shouldThrow = false;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("updates only the selected marker when the focused point changes", async () => {
    const view = renderRoute(0);
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];
    await waitFor(() => expect(map.sources.get("selected-point-source")?.setData).toHaveBeenCalled());
    map.sources.forEach((source) => source.setData.mockClear());
    map.jumpTo.mockClear();

    view.rerender(wrappedRoute(1));

    await waitFor(() => expect(map.sources.get("selected-point-source")?.setData).toHaveBeenCalledOnce());
    for (const sourceId of ["region-source", "route-line-source", "segment-line-source", "route-points-source"]) {
      expect(map.sources.get(sourceId)?.setData).not.toHaveBeenCalled();
    }
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [128.001, 38.001] });
  });

  it("can move the selected marker without recentering the comparison viewport", async () => {
    const view = render(wrappedRoute(0, false, { followSelectedPoint: false }));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];
    await waitFor(() => expect(map.sources.get("selected-point-source")?.setData).toHaveBeenCalled());
    map.sources.get("selected-point-source")?.setData.mockClear();
    map.jumpTo.mockClear();

    view.rerender(wrappedRoute(1, false, { followSelectedPoint: false }));

    await waitFor(() => expect(map.sources.get("selected-point-source")?.setData).toHaveBeenCalledOnce());
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it("fits and resolves the selected marker against the active interaction scope", async () => {
    const scopePoints = points.slice(1);
    const view = render(wrappedRoute(0, false, {
      interactionPoints: scopePoints,
      fitPoints: scopePoints,
      followSelectedPoint: false,
    }));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];

    await waitFor(() => expect(map.fitBounds).toHaveBeenCalled());
    const fitted = map.fitBounds.mock.calls.at(-1)?.[0] as { coordinates: number[][] };
    expect(fitted.coordinates).toEqual(scopePoints.map((point) => [point.longitude, point.latitude]));
    await waitFor(() => expect(map.sources.get("selected-point-source")?.setData).toHaveBeenCalled());
    const selected = map.sources.get("selected-point-source")!.setData.mock.calls.at(-1)?.[0] as {
      features: Array<{ geometry: { coordinates: number[] } }>;
    };
    expect(selected.features[0].geometry.coordinates).toEqual([scopePoints[0].longitude, scopePoints[0].latitude]);

    map.fitBounds.mockClear();
    await userEvent.setup().click(view.getByRole("button", { name: "Fit route" }));
    const manuallyFitted = map.fitBounds.mock.calls.at(-1)?.[0] as { coordinates: number[][] };
    expect(manuallyFitted.coordinates).toEqual(scopePoints.map((point) => [point.longitude, point.latitude]));
  });

  it("publishes section overlays to the MapLibre source", async () => {
    render(wrappedRoute(0, true));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];

    await waitFor(() => expect(map.sources.get("track-section-source")?.setData).toHaveBeenCalled());
    const data = map.sources.get("track-section-source")!.setData.mock.calls.at(-1)?.[0] as {
      features: Array<{ properties: { id: string }; geometry: { coordinates: number[][] } }>;
    };
    expect(data.features[0].properties.id).toBe("section-1");
    expect(data.features[0].geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(map.layers.has("track-sections")).toBe(true);
  });

  it("can hide dense route points so loss-colored sections remain readable", async () => {
    render(wrappedRoute(0, true, { showRoutePoints: false }));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];

    await waitFor(() => expect(map.sources.get("route-points-source")?.setData).toHaveBeenCalled());
    const data = map.sources.get("route-points-source")!.setData.mock.calls.at(-1)?.[0] as { features: unknown[] };
    expect(data.features).toEqual([]);
  });

  it("keeps hidden route points available as an invisible map-selection target", async () => {
    render(wrappedRoute(0, true, { showRoutePoints: false, interactiveRoutePoints: true }));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];

    await waitFor(() => expect(map.sources.get("route-points-source")?.setData).toHaveBeenCalled());
    const data = map.sources.get("route-points-source")!.setData.mock.calls.at(-1)?.[0] as { features: unknown[] };
    expect(data.features).toHaveLength(points.length);
    expect(map.setPaintProperty).toHaveBeenCalledWith("route-points", "circle-opacity", 0);
  });

  it("can hide the session route and publish explicit source-index hit targets", async () => {
    const focusedHitPoints = [
      { ...point(0), index: 401 },
      { ...point(1), index: 422 },
    ];
    render(wrappedRoute(0, false, {
      showRouteLine: false,
      interactionPoints: focusedHitPoints,
      showRoutePoints: false,
      interactiveRoutePoints: true,
    }));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];

    await waitFor(() => expect(map.sources.get("route-line-source")?.setData).toHaveBeenCalled());
    const route = map.sources.get("route-line-source")!.setData.mock.calls.at(-1)?.[0] as { features: unknown[] };
    const hits = map.sources.get("route-points-source")!.setData.mock.calls.at(-1)?.[0] as {
      features: Array<{ properties: { index: number } }>;
    };

    expect(route.features).toEqual([]);
    expect(hits.features.map((feature) => feature.properties.index)).toEqual([401, 422]);
  });

  it("emits explicit source indexes from focused hit targets in the coordinate fallback", async () => {
    mapMock.MapDouble.shouldThrow = true;
    const user = userEvent.setup();
    const onSelectedIndex = vi.fn();
    const view = render(wrappedRoute(0, false, {
      interactionPoints: [{ ...point(0), index: 401 }],
      showRoutePoints: false,
      interactiveRoutePoints: true,
      onSelectedIndex,
    }));

    await user.click(await view.findByTestId("route-hit-401"));

    expect(onSelectedIndex).toHaveBeenCalledWith(401);
  });

  it("renders only supported map actions and enables clear only for an active segment", async () => {
    const onSegmentChange = vi.fn();
    const view = render(wrappedRoute(0, false, {
      onSegmentChange,
      onRegionChange: null,
    }));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));

    expect(view.getByRole("button", { name: "Set segment start" })).toBeEnabled();
    expect(view.getByRole("button", { name: "Clear segment" })).toBeDisabled();
    expect(view.queryByRole("button", { name: "Create region" })).not.toBeInTheDocument();

    view.rerender(wrappedRoute(0, false, {
      segment: { startIndex: 0, endIndex: 1, source: "map" },
      onSegmentChange,
      onRegionChange: null,
    }));
    expect(view.getByRole("button", { name: "Clear segment" })).toBeEnabled();

    view.rerender(wrappedRoute(0, false, {
      onSegmentChange: null,
      onRegionChange: null,
    }));
    expect(view.queryByRole("button", { name: "Set segment start" })).not.toBeInTheDocument();
    expect(view.queryByRole("button", { name: "Clear segment" })).not.toBeInTheDocument();
  });

  it("renders section overlays in the coordinate fallback", async () => {
    mapMock.MapDouble.shouldThrow = true;
    const view = render(wrappedRoute(0, true));

    expect(await view.findByTestId("track-section-section-1")).toHaveAttribute("points");
  });

  it("uses loss styling and selects a section in the coordinate fallback", async () => {
    mapMock.MapDouble.shouldThrow = true;
    const user = userEvent.setup();
    const onSectionSelect = vi.fn();
    const view = render(wrappedRoute(0, true, {
      onSectionSelect,
      sectionVisuals: { "section-1": { color: "#be3b3b", width: 13, opacity: 0.75 } },
    }));

    const section = await view.findByRole("button", { name: "Corner 1" });
    expect(section).toHaveAttribute("stroke", "#be3b3b");
    expect(section).toHaveAttribute("stroke-width", "13");
    expect(section).toHaveAttribute("stroke-opacity", "0.75");

    await user.click(section);
    expect(onSectionSelect).toHaveBeenCalledWith("section-1");
  });

  it("publishes styled lap paths through separate solid, dashed, and dotted MapLibre layers", async () => {
    render(wrappedRoute(0, false, {
      lapOverlays: [
        { id: "lap-7", color: "#ef4444", points, width: 2, opacity: 0.18, lineStyle: "dashed", dashArray: [4, 3] },
        { id: "lap-8", color: "#059669", points, width: 3, opacity: 0.4, lineStyle: "dotted", dashArray: [1, 2.2] },
        { id: "lap-9", color: "#2563eb", points, width: 4, opacity: 1, lineStyle: "solid" },
      ],
      heatSegments: [{ id: "loss-1", coordinates: [[128, 38], [128.001, 38.001]], color: "#be3b3b", width: 9, opacity: 0.8 }],
      ghostMarkers: [{ id: "focus", label: "Lap 4 focused Ghost", coordinate: [128, 38], color: "#ef4444" }],
    }));
    await waitFor(() => expect(mapMock.MapDouble.instances).toHaveLength(1));
    const map = mapMock.MapDouble.instances[0];

    const laps = map.sources.get("lap-overlay-source")!.setData.mock.calls.at(-1)?.[0] as { features: Array<{ properties: Record<string, unknown> }> };
    expect(laps.features[0].properties).toMatchObject({ id: "lap-7", width: 2, opacity: 0.18, lineStyle: "dashed" });
    expect(map.layers.has("lap-overlays")).toBe(false);
    expect(map.layers.has("lap-overlays-solid")).toBe(true);
    expect(map.layers.has("lap-overlays-dashed")).toBe(true);
    expect(map.layers.has("lap-overlays-dotted")).toBe(true);
    expect(map.layerDefinitions.get("lap-overlays-dashed")).toMatchObject({
      filter: ["==", ["get", "lineStyle"], "dashed"],
      paint: { "line-dasharray": [4, 3] },
    });
    expect(map.layerDefinitions.get("lap-overlays-dotted")).toMatchObject({
      filter: ["==", ["get", "lineStyle"], "dotted"],
      paint: { "line-dasharray": [1, 2.2] },
    });
    expect(map.sources.get("loss-rate-segment-source")?.setData).toHaveBeenCalled();
    expect(map.sources.get("ghost-marker-source")?.setData).toHaveBeenCalled();
    expect(map.layers.has("loss-rate-segments")).toBe(true);
    expect(map.layers.has("ghost-markers")).toBe(true);
  });

  it("renders heat segments and accessible Ghosts in the coordinate fallback", async () => {
    mapMock.MapDouble.shouldThrow = true;
    const view = render(wrappedRoute(0, false, {
      heatSegments: [{ id: "loss-1", coordinates: [[128, 38], [128.001, 38.001]], color: "#be3b3b", width: 9, opacity: 0.8 }],
      ghostMarkers: [
        { id: "focus", label: "Lap 4 focused Ghost", coordinate: [128, 38], color: "#ef4444" },
        { id: "reference", label: "Lap 2 reference Ghost", coordinate: [128.001, 38.001], color: "#2563eb" },
      ],
    }));

    expect(await view.findByTestId("loss-rate-loss-1")).toBeVisible();
    expect(view.getByLabelText("Lap 4 focused Ghost")).toBeVisible();
    expect(view.getByLabelText("Lap 2 reference Ghost")).toBeVisible();
  });

  it("renders lap dash styles in the coordinate fallback", async () => {
    mapMock.MapDouble.shouldThrow = true;
    const view = render(wrappedRoute(0, false, {
      lapOverlays: [{ id: "lap-7", color: "#ef4444", points, width: 2, opacity: 0.18, lineStyle: "dashed", dashArray: [4, 3] }],
    }));

    expect(await view.findByTestId("lap-overlay-lap-7")).toHaveAttribute("stroke-dasharray", "4 3");
  });
});

function renderRoute(selectedIndex: number) {
  return render(wrappedRoute(selectedIndex));
}

function wrappedRoute(
  selectedIndex: number,
  includeSections = false,
  options: {
    onSectionSelect?: (sectionId: string) => void;
    sectionVisuals?: Record<string, { color: string; width?: number; opacity?: number }>;
    showRoutePoints?: boolean;
    interactiveRoutePoints?: boolean;
    showRouteLine?: boolean;
    interactionPoints?: GpsPoint[];
    fitPoints?: GpsPoint[];
    onSelectedIndex?: (index: number) => void;
    segment?: ActiveSegment;
    onSegmentChange?: ((segment?: ActiveSegment) => void) | null;
    onRegionChange?: (ComponentProps<typeof RouteMap>["onRegionChange"]) | null;
    lapOverlays?: ComponentProps<typeof RouteMap>["lapOverlays"];
    heatSegments?: ComponentProps<typeof RouteMap>["heatSegments"];
    ghostMarkers?: ComponentProps<typeof RouteMap>["ghostMarkers"];
    followSelectedPoint?: boolean;
  } = {},
) {
  return (
    <I18nProvider>
      <RouteMap
        points={points}
        selectedIndex={selectedIndex}
        sourceVisibility={{ rawGps: true, enhancedGps: true }}
        settings={settings}
        segment={options.segment}
        trackCenterline={includeSections ? { type: "LineString", coordinates: [[128, 38], [128.001, 38.001]] } : undefined}
        trackSections={includeSections ? [{
          id: "section-1",
          name: "Corner 1",
          kind: "corner-right",
          startDistanceMeters: 0,
          endDistanceMeters: 120,
        }] : undefined}
        sectionVisuals={options.sectionVisuals}
        lapOverlays={options.lapOverlays}
        heatSegments={options.heatSegments}
        ghostMarkers={options.ghostMarkers}
        followSelectedPoint={options.followSelectedPoint}
        showRoutePoints={options.showRoutePoints}
        interactiveRoutePoints={options.interactiveRoutePoints}
        showRouteLine={options.showRouteLine}
        interactionPoints={options.interactionPoints}
        fitPoints={options.fitPoints}
        onSectionSelect={options.onSectionSelect}
        onSelectedIndex={options.onSelectedIndex ?? vi.fn()}
        onSegmentChange={options.onSegmentChange === null ? undefined : options.onSegmentChange ?? vi.fn()}
        onRegionChange={options.onRegionChange === null ? undefined : options.onRegionChange ?? vi.fn()}
        onSettingsChange={vi.fn()}
      />
    </I18nProvider>
  );
}

function point(index: number): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "06072026",
    time: `0000${String(index).padStart(2, "0")}`,
    latitude: 38 + index * 0.001,
    longitude: 128 + index * 0.001,
    altitudeMeters: 100,
    speedKmh: index * 10,
    bearingDegrees: 0,
    satelliteCount: 8,
    source: "RawGps",
    confidence: 1,
  };
}
