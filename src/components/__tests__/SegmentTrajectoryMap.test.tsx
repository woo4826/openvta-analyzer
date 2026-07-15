import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { RouteMap } from "../RouteMap";
import type { SegmentAnalysisResult } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";

vi.mock("../RouteMap", () => ({
  RouteMap: (props: ComponentProps<typeof RouteMap>) => (
    <div
      data-testid="trajectory-route-map"
      data-overlays={JSON.stringify(props.lapOverlays)}
      data-heat={JSON.stringify(props.heatSegments)}
      data-ghosts={JSON.stringify(props.ghostMarkers)}
    >
      {props.ghostMarkers?.map((ghost) => <span key={ghost.id}>{ghost.label}</span>)}
    </div>
  ),
}));

import { SegmentTrajectoryMap } from "../SegmentTrajectoryMap";

describe("SegmentTrajectoryMap", () => {
  it("renders only focused and reference laps even when analysis contains more records", () => {
    render(
      <I18nProvider>
        <SegmentTrajectoryMap
          analysis={analysis()}
          points={points()}
          centerline={{ type: "LineString", coordinates: [[128, 38], [128.002, 38]] }}
          sections={[]}
          settings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
          selectedIndex={0}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          cursorDistanceMeters={50}
          onSelectedIndex={vi.fn()}
          onSectionSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    const map = screen.getByTestId("trajectory-route-map");
    const overlays = JSON.parse(map.getAttribute("data-overlays")!);
    expect(overlays).toHaveLength(2);
    expect(overlays.find((overlay: { id: string }) => overlay.id === "lap-2")).toMatchObject({ width: 8, opacity: 0.96 });
    expect(overlays.some((overlay: { id: string }) => overlay.id === "lap-3")).toBe(false);
    expect(JSON.parse(map.getAttribute("data-heat")!)).not.toHaveLength(0);
    expect(screen.getByText("Lap 2 focused Ghost")).toBeVisible();
    expect(screen.getByText("Lap 1 reference Ghost")).toBeVisible();
    expect(screen.getByText("Focused lap · Lap 2")).toBeVisible();
    expect(screen.getByText("Reference lap · Lap 1")).toBeVisible();
  });

  it("always renders both role paths, Ghosts, legend entries, and role-limited badges", () => {
    render(
      <I18nProvider>
        <SegmentTrajectoryMap
          analysis={analysis()}
          points={points()}
          centerline={{ type: "LineString", coordinates: [[128, 38], [128.002, 38]] }}
          sections={[]}
          settings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
          selectedIndex={0}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          cursorDistanceMeters={50}
          onSelectedIndex={vi.fn()}
          onSectionSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    const map = screen.getByTestId("trajectory-route-map");
    expect(JSON.parse(map.getAttribute("data-overlays")!)).toHaveLength(2);
    expect(JSON.parse(map.getAttribute("data-ghosts")!)).toHaveLength(2);
    expect(screen.getByText("Lap 2 focused Ghost")).toBeVisible();
    expect(screen.getByText("Lap 1 reference Ghost")).toBeVisible();
    expect(screen.getByText("Reference lap · Lap 1")).toBeVisible();
    expect(screen.getByText("Shortest recorded path · Lap 1")).toBeVisible();
  });

  it("keeps fastest and shortest path labels distinct", () => {
    render(
      <I18nProvider>
        <SegmentTrajectoryMap
          analysis={analysis()}
          points={points()}
          centerline={{ type: "LineString", coordinates: [[128, 38], [128.002, 38]] }}
          sections={[]}
          settings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
          selectedIndex={0}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          onSelectedIndex={vi.fn()}
          onSectionSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Best time · Lap 2")).toBeVisible();
    expect(screen.getByText("Shortest recorded path · Lap 1")).toBeVisible();
  });

  it("does not show fastest or shortest badges for a lap outside the two roles", () => {
    const result = analysis();
    result.fastestLapId = "lap-3";
    result.shortestLapId = "lap-3";

    render(
      <I18nProvider>
        <SegmentTrajectoryMap
          analysis={result}
          points={points()}
          centerline={{ type: "LineString", coordinates: [[128, 38], [128.002, 38]] }}
          sections={[]}
          settings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
          selectedIndex={0}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          onSelectedIndex={vi.fn()}
          onSectionSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(/Best time/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Shortest recorded path/)).not.toBeInTheDocument();
  });

  it("does not imply loss-rate precision when the focused lap lacks full scope coverage", () => {
    const partial = analysis();
    partial.records[1].coverage = "partial";
    render(
      <I18nProvider>
        <SegmentTrajectoryMap
          analysis={partial}
          points={points()}
          centerline={{ type: "LineString", coordinates: [[128, 38], [128.002, 38]] }}
          sections={[]}
          settings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
          selectedIndex={0}
          focusedLapId="lap-2"
          referenceLapId="lap-1"
          onSelectedIndex={vi.fn()}
          onSectionSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(JSON.parse(screen.getByTestId("trajectory-route-map").getAttribute("data-heat")!)).toEqual([]);
  });
});

function analysis(): SegmentAnalysisResult {
  return {
    scope: { kind: "section", sectionId: "c1" },
    range: { startDistanceMeters: 0, endDistanceMeters: 100 },
    referenceLapId: "lap-1",
    fastestLapId: "lap-2",
    shortestLapId: "lap-1",
    records: [1, 2, 3].map((ordinal) => ({
      lapId: `lap-${ordinal}`,
      ordinal,
      completion: "complete",
      validity: "valid",
      flags: [],
      fromPartialLap: false,
      coverage: "complete",
      eligibleForBest: true,
      durationSeconds: 10 + ordinal,
      drivenDistanceMeters: 100 + ordinal,
      gpsConfidence: "high",
      trajectory: [0, 50, 100].map((distance, index) => ({
        distanceMeters: distance,
        elapsedSeconds: index * ordinal,
        speedKmh: 80,
        latitude: 38 + ordinal * 0.00001 + index * 0.00001,
        longitude: 128 + index * 0.001,
        sourceIndex: index,
        referenceElapsedSeconds: index,
        deltaSeconds: index * 0.1 * ordinal,
        pathDistanceMeters: distance,
        signedOffsetMeters: ordinal,
        lossRateSecondsPer100m: index ? ordinal * 0.1 : 0,
      })),
    })),
  };
}

function points() {
  return [0, 1, 2].map((index) => ({
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "20260715",
    time: "000000",
    latitude: 38,
    longitude: 128 + index * 0.001,
    altitudeMeters: 0,
    speedKmh: 80,
    bearingDegrees: 90,
    satelliteCount: 10,
    source: "RawGps" as const,
    confidence: 1,
  }));
}
