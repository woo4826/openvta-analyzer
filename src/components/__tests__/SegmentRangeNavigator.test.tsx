import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TrackSection } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { SegmentRangeNavigator } from "../SegmentRangeNavigator";
import { snapRangeToBoundaries } from "../segmentRange";

const sections: TrackSection[] = [
  { id: "straight-1", name: "Straight 1", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 400 },
  { id: "corner-1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 400, endDistanceMeters: 550 },
  { id: "straight-2", name: "Straight 2", kind: "straight", startDistanceMeters: 550, endDistanceMeters: 850 },
  { id: "corner-2", name: "Corner 2", kind: "corner-left", startDistanceMeters: 850, endDistanceMeters: 1000 },
];

describe("SegmentRangeNavigator", () => {
  it("renders the proportional overview as presentation rather than tiny targets", () => {
    const { container } = renderNavigator();
    const [straight, corner] = [...container.querySelectorAll<HTMLElement>(".segment-proportion-section")];
    expect(straight).toHaveStyle({ left: "0%", width: "40%" });
    expect(corner).toHaveStyle({ left: "40%", width: "15%" });
    expect(screen.queryByRole("button", { name: /Corner 1/ })).not.toBeInTheDocument();
  });

  it("exposes two labelled, keyboard-operable range thumbs", () => {
    const onRange = vi.fn();
    renderNavigator({ scope: { kind: "range", startDistanceMeters: 100, endDistanceMeters: 800, source: "manual" }, onRange });

    const start = screen.getByRole("slider", { name: "Range start" });
    const end = screen.getByRole("slider", { name: "Range end" });
    expect(start).toHaveAttribute("aria-valuenow", "100");
    expect(end).toHaveAttribute("aria-valuenow", "800");

    fireEvent.keyDown(start, { key: "ArrowRight" });
    fireEvent.keyUp(start, { key: "ArrowRight" });
    expect(onRange).toHaveBeenCalledWith(101, 800);
  });

  it("keeps the full distance scale available for custom ranges", () => {
    renderNavigator();
    expect(screen.getByText("1000 m")).toBeVisible();
  });

  it("snaps only near known section boundaries", () => {
    expect(snapRangeToBoundaries([394, 856], sections, 1000)).toEqual([400, 850]);
    expect(snapRangeToBoundaries([250, 700], sections, 1000)).toEqual([250, 700]);
  });
});

function renderNavigator(overrides: Partial<React.ComponentProps<typeof SegmentRangeNavigator>> = {}) {
  const props: React.ComponentProps<typeof SegmentRangeNavigator> = {
    scope: { kind: "whole-lap" },
    sections,
    totalDistanceMeters: 1000,
    snapToSections: true,
    onWholeLap: vi.fn(),
    onRange: vi.fn(),
    ...overrides,
  };
  return render(<I18nProvider><SegmentRangeNavigator {...props} /></I18nProvider>);
}
