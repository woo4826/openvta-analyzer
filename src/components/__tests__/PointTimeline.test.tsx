import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GpsPoint } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { PointTimeline } from "../PointTimeline";

vi.mock("maplibre-gl", () => ({ default: {} }));

describe("PointTimeline", () => {
  it("handles empty, single-point, and selectable timelines", () => {
    const onSelectedPointIndex = vi.fn();
    const view = renderTimeline([], 0, onSelectedPointIndex);
    let slider = screen.getByRole("slider", { name: "Point timeline" });
    expect(slider).toBeDisabled();
    expect(slider).toHaveAttribute("max", "0");
    expect(slider).not.toHaveAttribute("aria-valuetext");
    expect(screen.getByText("0 / 0")).toBeVisible();

    view.rerender(wrappedTimeline([point(0)], 0, onSelectedPointIndex));
    slider = screen.getByRole("slider", { name: "Point timeline" });
    expect(slider).toBeDisabled();
    expect(slider).toHaveAttribute("aria-valuetext", "Point 1 of 1, 06072026 000000");
    expect(screen.getByText("1 / 1")).toBeVisible();

    view.rerender(wrappedTimeline([point(0), point(1)], 0, onSelectedPointIndex));
    slider = screen.getByRole("slider", { name: "Point timeline" });
    expect(slider).toBeEnabled();
    expect(slider).toHaveAttribute("max", "1");
    fireEvent.change(slider, { target: { value: "1" } });
    expect(onSelectedPointIndex).toHaveBeenLastCalledWith(1);
  });
});

function renderTimeline(points: GpsPoint[], selectedPointIndex: number, onSelectedPointIndex: (index: number) => void) {
  return render(wrappedTimeline(points, selectedPointIndex, onSelectedPointIndex));
}

function wrappedTimeline(points: GpsPoint[], selectedPointIndex: number, onSelectedPointIndex: (index: number) => void) {
  return (
    <I18nProvider>
      <PointTimeline points={points} selectedPointIndex={selectedPointIndex} onSelectedPointIndex={onSelectedPointIndex} />
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
