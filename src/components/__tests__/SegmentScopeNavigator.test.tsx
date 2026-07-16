import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisScope, TrackSection } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { SegmentFilter } from "../../app/useSegmentWorkbench";
import { SegmentScopeNavigator } from "../SegmentScopeNavigator";

const sections: TrackSection[] = [
  { id: "straight-1", name: "Straight 1", kind: "straight", startDistanceMeters: 0, endDistanceMeters: 850 },
  { id: "corner-2", name: "Corner 2", kind: "corner-right", startDistanceMeters: 850, endDistanceMeters: 1020 },
  { id: "straight-2", name: "Straight 2", kind: "straight", startDistanceMeters: 1020, endDistanceMeters: 4028 },
];

describe("SegmentScopeNavigator", () => {
  it("keeps section buttons, precise selection, range thumbs, and summary on one controlled scope", async () => {
    const user = userEvent.setup();
    const onRange = vi.fn();

    function Harness() {
      const [scope, setScope] = useState<AnalysisScope>({ kind: "whole-lap" });
      const [filter, setFilter] = useState<SegmentFilter>("all");
      return <SegmentScopeNavigator
        scope={scope}
        filter={filter}
        sections={sections}
        totalDistanceMeters={4028}
        snapToSections={false}
        onFilter={setFilter}
        onWholeLap={() => setScope({ kind: "whole-lap" })}
        onSection={(sectionId) => setScope({ kind: "section", sectionId })}
        onRange={(startDistanceMeters, endDistanceMeters) => {
          onRange(startDistanceMeters, endDistanceMeters);
          setScope({ kind: "range", startDistanceMeters, endDistanceMeters, source: "manual" });
        }}
      />;
    }

    render(<I18nProvider><Harness /></I18nProvider>);

    expect(screen.getByText("0–4028 m")).toBeVisible();
    expect(screen.getByRole("slider", { name: "Range end" })).toHaveAttribute("aria-valuenow", "4028");

    await user.click(screen.getByRole("button", { name: /Corner 2.*850–1020 m/ }));
    expect(screen.getByText("850–1020 m")).toBeVisible();
    expect(screen.getByRole("button", { name: /Corner 2.*850–1020 m/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("slider", { name: "Range start" })).toHaveAttribute("aria-valuenow", "850");

    await user.selectOptions(screen.getByRole("combobox", { name: "Go to section" }), "straight-1");
    expect(screen.getByText("0–850 m")).toBeVisible();

    const start = screen.getByRole("slider", { name: "Range start" });
    fireEvent.keyDown(start, { key: "ArrowRight" });
    fireEvent.keyUp(start, { key: "ArrowRight" });
    expect(onRange).toHaveBeenCalledWith(1, 850);
    expect(screen.getByText("1–850 m")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Whole lap" }));
    expect(screen.getByText("0–4028 m")).toBeVisible();
  });

  it("keeps exact proportional geometry while filtering navigation choices", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [filter, setFilter] = useState<SegmentFilter>("all");
      return <SegmentScopeNavigator
        scope={{ kind: "whole-lap" }}
        filter={filter}
        sections={sections}
        totalDistanceMeters={4028}
        snapToSections
        onFilter={setFilter}
        onWholeLap={vi.fn()}
        onSection={vi.fn()}
        onRange={vi.fn()}
      />;
    }
    const { container } = render(<I18nProvider><Harness /></I18nProvider>);

    const corner = container.querySelector<HTMLElement>('[data-section-id="corner-2"]')!;
    expect(Number.parseFloat(corner.style.left)).toBeCloseTo(850 / 4028 * 100, 5);
    expect(Number.parseFloat(corner.style.width)).toBeCloseTo(170 / 4028 * 100, 5);

    await user.click(screen.getByRole("button", { name: "Corners" }));
    expect(screen.getByRole("option", { name: "Corner 2 · 170 m" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Straight 1 · 850 m" })).not.toBeInTheDocument();
  });

  it("keeps whole-lap and custom range controls available when a track has no stored sections", () => {
    render(<I18nProvider><SegmentScopeNavigator
      scope={{ kind: "whole-lap" }}
      filter="all"
      sections={[]}
      totalDistanceMeters={4028}
      snapToSections={false}
      onFilter={vi.fn()}
      onWholeLap={vi.fn()}
      onSection={vi.fn()}
      onRange={vi.fn()}
    /></I18nProvider>);

    expect(screen.getByRole("combobox", { name: "Go to section" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Range start" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Range end" })).toHaveAttribute("aria-valuemax", "4028");
  });
});
