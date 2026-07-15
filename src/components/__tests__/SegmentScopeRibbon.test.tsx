import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentScopeRibbon } from "../SegmentScopeRibbon";
import { I18nProvider } from "../../i18n/I18nProvider";

describe("SegmentScopeRibbon", () => {
  it("exposes whole lap, corner/straight filters, and the selected section as one pressed state", async () => {
    const user = userEvent.setup();
    const onSection = vi.fn();
    const onFilter = vi.fn();
    render(<I18nProvider><SegmentScopeRibbon
      scope={{ kind: "section", sectionId: "c6" }}
      filter="corners"
      sections={[
        { id: "c6", name: "Corner 6", kind: "corner-right", startDistanceMeters: 1700, endDistanceMeters: 2040 },
        { id: "c7", name: "Corner 7", kind: "corner-left", startDistanceMeters: 2100, endDistanceMeters: 2300 },
      ]}
      losses={{ c6: 2.682 }}
      onWholeLap={vi.fn()}
      onFilter={onFilter}
      onSection={onSection}
    /></I18nProvider>);

    expect(screen.getByRole("button", { name: /Corner 6.*2.682/ })).toHaveAttribute("aria-current", "true");
    await user.click(screen.getByRole("button", { name: "Straights" }));
    expect(onFilter).toHaveBeenCalledWith("straights");
    await user.click(screen.getByRole("button", { name: /Corner 7/ }));
    expect(onSection).toHaveBeenCalledWith("c7");
  });

  it("moves DOM focus and selection repeatedly with arrow keys", async () => {
    const user = userEvent.setup();
    const onSection = vi.fn();
    const sections = [
      { id: "c6", name: "Corner 6", kind: "corner-right" as const, startDistanceMeters: 1700, endDistanceMeters: 2040 },
      { id: "c7", name: "Corner 7", kind: "corner-left" as const, startDistanceMeters: 2100, endDistanceMeters: 2300 },
      { id: "c8", name: "Corner 8", kind: "corner-right" as const, startDistanceMeters: 2320, endDistanceMeters: 2490 },
    ];
    function Harness() {
      const [sectionId, setSectionId] = useState("c6");
      return <SegmentScopeRibbon
        scope={{ kind: "section", sectionId }}
        filter="all"
        sections={sections}
        onWholeLap={vi.fn()}
        onFilter={vi.fn()}
        onSection={(id) => {
          onSection(id);
          setSectionId(id);
        }}
      />;
    }
    render(<I18nProvider><Harness /></I18nProvider>);

    screen.getByRole("button", { name: /Corner 6/ }).focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");

    expect(onSection.mock.calls.map(([id]) => id)).toEqual(["c7", "c8"]);
    expect(screen.getByRole("button", { name: /Corner 8/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: /Corner 8/ })).toHaveAttribute("aria-current", "true");
  });

  it("recenters the active chip when a viewport resize pushes it outside the scroller", () => {
    render(<I18nProvider><SegmentScopeRibbon
      scope={{ kind: "section", sectionId: "s5" }}
      filter="all"
      sections={[{ id: "s5", name: "Straight 5", kind: "straight", startDistanceMeters: 1100, endDistanceMeters: 1400 }]}
      onWholeLap={vi.fn()}
      onFilter={vi.fn()}
      onSection={vi.fn()}
    /></I18nProvider>);
    const chip = screen.getByRole("button", { name: /Straight 5/ });
    const scroller = document.querySelector<HTMLElement>(".segment-scope-scroll")!;
    const scrollIntoView = vi.fn();
    Object.defineProperty(chip, "scrollIntoView", { configurable: true, value: scrollIntoView });
    vi.spyOn(chip, "getBoundingClientRect").mockReturnValue({ left: 415, right: 530 } as DOMRect);
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ left: 17, right: 373 } as DOMRect);

    window.dispatchEvent(new Event("resize"));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "center" });
  });
});
