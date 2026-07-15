import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SegmentLapRecord } from "../../domain/types";
import { SegmentLapTable } from "../SegmentLapTable";
import { I18nProvider } from "../../i18n/I18nProvider";

describe("SegmentLapTable", () => {
  it("keeps every complete and partial lap visible with focus, reference, path, and eligibility evidence", async () => {
    const user = userEvent.setup();
    const onFocusedLap = vi.fn();
    render(<I18nProvider><SegmentLapTable
      records={records()}
      focusedLapId="lap-4"
      referenceLapId="lap-3"
      fastestLapId="lap-4"
      shortestLapId="lap-2"
      onFocusedLap={onFocusedLap}
      onReferenceLap={vi.fn()}
    /></I18nProvider>);

    expect(screen.getAllByRole("row")).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: /Focus Lap 6/ }));
    expect(onFocusedLap).toHaveBeenCalledWith("lap-6");
    expect(screen.getByText("Best time")).toBeVisible();
    expect(screen.getByText("Shortest recorded path")).toBeVisible();
    expect(screen.getByText("Opening fragment · scope not fully covered")).toBeVisible();
    expect(screen.getByText("Closing fragment · GPS gap")).toBeVisible();
    expect(screen.getByRole("button", { name: "Focus Opening fragment" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Focus Lap 1" })).not.toBeInTheDocument();

    await user.click(screen.getAllByText("Details", { selector: "summary" }).at(-1)!);
    expect(screen.getAllByText("Unreliable · low GPS confidence")).toHaveLength(2);
  });
});

function records(): SegmentLapRecord[] {
  return Array.from({ length: 9 }, (_, index) => {
    const ordinal = index + 1;
    const partial = ordinal === 1 || ordinal === 9;
    return {
      lapId: `lap-${ordinal}`,
      ordinal,
      completion: ordinal === 1 ? "partial-start" : ordinal === 9 ? "partial-end" : "complete",
      validity: ordinal === 9 ? "invalid" : "valid",
      flags: ordinal === 9 ? ["gps-gap"] : [],
      fromPartialLap: partial,
      coverage: partial ? "none" : "complete",
      eligibleForBest: !partial,
      durationSeconds: partial ? undefined : 10 + ordinal,
      deltaBestSeconds: partial ? undefined : ordinal === 4 ? 0 : ordinal / 10,
      drivenDistanceMeters: partial ? undefined : 320 + ordinal,
      deltaShortestMeters: partial ? undefined : ordinal === 2 ? 0 : ordinal,
      entrySpeedKmh: partial ? undefined : 120,
      minimumSpeedKmh: partial ? undefined : 70,
      averageSpeedKmh: partial ? undefined : 92,
      maximumSpeedKmh: partial ? undefined : 140,
      exitSpeedKmh: partial ? undefined : 110,
      peakLossRateSecondsPer100m: partial ? undefined : 0.2,
      maxLateralG: ordinal === 9 ? 1.2 : 0.9,
      maxDecelerationG: ordinal === 9 ? 1.1 : 0.8,
      gpsConfidence: ordinal === 9 ? "low" : "high",
      trajectory: [],
    };
  });
}
