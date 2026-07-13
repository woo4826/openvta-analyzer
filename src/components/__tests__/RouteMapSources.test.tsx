import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsPoint, MapSettings } from "../../domain/types";
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

    addLayer(layer: { id: string }) {
      this.layers.add(layer.id);
    }

    getCanvas() {
      return { style: { cursor: "" } };
    }

    getZoom() {
      return 14;
    }
  }

  class LngLatBoundsDouble {
    extend() {
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

const points = [point(0), point(1)];
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

  it("renders section overlays in the coordinate fallback", async () => {
    mapMock.MapDouble.shouldThrow = true;
    const view = render(wrappedRoute(0, true));

    expect(await view.findByTestId("track-section-section-1")).toHaveAttribute("points");
  });
});

function renderRoute(selectedIndex: number) {
  return render(wrappedRoute(selectedIndex));
}

function wrappedRoute(selectedIndex: number, includeSections = false) {
  return (
    <I18nProvider>
      <RouteMap
        points={points}
        selectedIndex={selectedIndex}
        sourceVisibility={{ rawGps: true, enhancedGps: true }}
        settings={settings}
        trackCenterline={includeSections ? { type: "LineString", coordinates: [[128, 38], [128.001, 38.001]] } : undefined}
        trackSections={includeSections ? [{
          id: "section-1",
          name: "Corner 1",
          kind: "corner-right",
          startDistanceMeters: 0,
          endDistanceMeters: 120,
        }] : undefined}
        onSelectedIndex={vi.fn()}
        onSegmentChange={vi.fn()}
        onRegionChange={vi.fn()}
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
