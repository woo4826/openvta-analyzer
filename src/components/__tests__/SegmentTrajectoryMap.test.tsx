import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { RouteMap } from "../RouteMap";
import type { SegmentAnalysisResult } from "../../domain/types";

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
  it("shows every traversing lap while emphasizing focused/reference paths and two synchronized Ghosts", () => {
    render(<SegmentTrajectoryMap
      analysis={analysis()}
      points={points()}
      centerline={{ type: "LineString", coordinates: [[128, 38], [128.002, 38]] }}
      sections={[]}
      settings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
      selectedIndex={0}
      focusedLapId="lap-2"
      referenceLapId="lap-1"
      overlayLapIds={["lap-1", "lap-2"]}
      cursorDistanceMeters={50}
      onSelectedIndex={vi.fn()}
      onSectionSelect={vi.fn()}
    />);

    const map = screen.getByTestId("trajectory-route-map");
    const overlays = JSON.parse(map.getAttribute("data-overlays")!);
    expect(overlays).toHaveLength(3);
    expect(overlays.find((overlay: { id: string }) => overlay.id === "lap-2")).toMatchObject({ width: 8, opacity: 0.96 });
    expect(overlays.find((overlay: { id: string }) => overlay.id === "lap-3").opacity).toBeLessThan(0.3);
    expect(JSON.parse(map.getAttribute("data-heat")!)).not.toHaveLength(0);
    expect(screen.getByText("Lap 2 focused Ghost")).toBeVisible();
    expect(screen.getByText("Lap 1 reference Ghost")).toBeVisible();
  });

  it("keeps fastest and shortest path labels distinct", () => {
    render(<SegmentTrajectoryMap
      analysis={analysis()}
      points={points()}
      centerline={{ type: "LineString", coordinates: [[128, 38], [128.002, 38]] }}
      sections={[]}
      settings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [20, 50, 80, 120] }}
      selectedIndex={0}
      focusedLapId="lap-2"
      referenceLapId="lap-1"
      overlayLapIds={["lap-1", "lap-2"]}
      onSelectedIndex={vi.fn()}
      onSectionSelect={vi.fn()}
    />);

    expect(screen.getByText("Fastest path · Lap 2")).toBeVisible();
    expect(screen.getByText("Shortest recorded path · Lap 1")).toBeVisible();
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
