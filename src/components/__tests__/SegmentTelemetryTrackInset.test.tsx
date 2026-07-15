import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SegmentLapRecord } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { SegmentTelemetryTrackInset } from "../SegmentTelemetryTrackInset";

describe("SegmentTelemetryTrackInset", () => {
  it("keeps both trajectories and their synchronized cursor positions visible", () => {
    render(<I18nProvider><SegmentTelemetryTrackInset focused={record("focus", 0)} reference={record("reference", 0.0001)} cursorDistanceMeters={50} /></I18nProvider>);

    expect(screen.getByTestId("focused-track-path")).toHaveAttribute("d", expect.stringContaining("L"));
    expect(screen.getByTestId("reference-track-path")).toHaveAttribute("d", expect.stringContaining("L"));
    expect(screen.getByTestId("focused-track-marker")).toHaveAttribute("cx", "110");
    expect(screen.getByTestId("reference-track-marker")).toBeVisible();
    expect(screen.getByRole("img", { name: "Focused and reference trajectories with synchronized cursor markers" })).toBeVisible();
  });

  it("explains when no focused path can be drawn", () => {
    render(<I18nProvider><SegmentTelemetryTrackInset cursorDistanceMeters={0} /></I18nProvider>);
    expect(screen.getByText("Track position unavailable for this scope.")).toBeVisible();
  });
});

function record(id: string, latitudeOffset: number): SegmentLapRecord {
  return {
    lapId: id,
    ordinal: 1,
    completion: "complete",
    validity: "valid",
    flags: [],
    fromPartialLap: false,
    coverage: "complete",
    eligibleForBest: true,
    gpsConfidence: "high",
    trajectory: [0, 50, 100].map((distance, index) => ({
      distanceMeters: distance,
      elapsedSeconds: index,
      speedKmh: 80,
      latitude: 38 + latitudeOffset + index * 0.0001,
      longitude: 128 + index * 0.001,
      sourceIndex: index,
      referenceElapsedSeconds: index,
      deltaSeconds: 0,
      pathDistanceMeters: distance,
      signedOffsetMeters: 0,
    })),
  };
}
