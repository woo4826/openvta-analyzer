import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GpsPoint, LapResult, LapSectionResult, TrackSection } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LapOpportunityOverview } from "../LapOpportunityOverview";

vi.mock("../RouteMap", () => ({ RouteMap: () => <div data-testid="opportunity-map" /> }));

describe("LapOpportunityOverview", () => {
  it("renders ranked losses, session KPIs, and selects an opportunity", async () => {
    const user = userEvent.setup();
    const onSelectSection = vi.fn();
    render(
      <I18nProvider>
        <LapOpportunityOverview
          points={[gps(0), gps(1)]}
          laps={[lap("lap-a", 1, 11), lap("lap-b", 2, 10)]}
          primaryLapId="lap-a"
          onPrimaryLap={vi.fn()}
          fastestSeconds={10}
          theoreticalBestSeconds={9.2}
          sections={sections}
          sectionResults={results}
          selectedSectionId="corner-2"
          onSelectSection={onSelectSection}
          selectedPointIndex={0}
          onSelectedPointIndex={vi.fn()}
          sourceVisibility={{ rawGps: true, enhancedGps: false }}
          mapSettings={{ pointSize: 4, tileUrl: "tiles", speedThresholds: [20, 40, 60, 80] }}
          onMapSettingsChange={vi.fn()}
          onActiveSegment={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Biggest time-loss opportunities" })).toBeVisible();
    expect(screen.getByText("0:10.000")).toBeVisible();
    expect(screen.getByText("0:09.200")).toBeVisible();
    expect(screen.getByRole("button", { name: /Corner 2.*0.800/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("opportunity-map")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Corner 1/ }));
    expect(onSelectSection).toHaveBeenCalledWith("corner-1");
  });
});

const sections: TrackSection[] = [
  { id: "corner-1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 0, endDistanceMeters: 100 },
  { id: "corner-2", name: "Corner 2", kind: "corner-left", startDistanceMeters: 100, endDistanceMeters: 200 },
];

const results: LapSectionResult[] = [
  sectionResult("lap-a", "corner-1", 6.4, 80),
  sectionResult("lap-b", "corner-1", 6.0, 90),
  sectionResult("lap-a", "corner-2", 8.0, 82),
  sectionResult("lap-b", "corner-2", 7.2, 88),
];

function sectionResult(lapId: string, sectionId: string, durationSeconds: number, exitSpeedKmh: number): LapSectionResult {
  const section = sections.find((item) => item.id === sectionId)!;
  return {
    id: `${lapId}-${sectionId}`,
    lapId,
    sectionId,
    name: section.name,
    kind: section.kind,
    durationSeconds,
    entrySpeedKmh: 100,
    minimumSpeedKmh: 65,
    averageSpeedKmh: 80,
    maximumSpeedKmh: 110,
    exitSpeedKmh,
    fromPartialLap: false,
    eligibleForBest: true,
  };
}

function lap(id: string, ordinal: number, durationSeconds: number): LapResult {
  return {
    id,
    ordinal,
    completion: "complete",
    validity: "valid",
    flags: [],
    start: { id: `${id}-start`, source: "auto", pointIndex: 0, elapsedSeconds: 0, coordinate: [0, 0] },
    end: { id: `${id}-end`, source: "auto", pointIndex: 1, elapsedSeconds: durationSeconds, coordinate: [0.001, 0] },
    startIndex: 0,
    endIndex: 1,
    durationSeconds,
    distanceKm: 0.1,
    averageSpeedKmh: 80,
    maxSpeedKmh: 100,
  };
}

function gps(index: number): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "01012026",
    time: "000000",
    latitude: 37,
    longitude: 127 + index * 0.001,
    altitudeMeters: 0,
    speedKmh: 80,
    bearingDegrees: 90,
    satelliteCount: 10,
    elapsedRealtimeNanos: index * 1_000_000_000,
    source: "RawGps",
    confidence: 1,
  };
}
