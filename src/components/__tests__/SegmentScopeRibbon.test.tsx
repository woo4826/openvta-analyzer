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
      onWholeLap={vi.fn()}
      onFilter={onFilter}
      onSection={onSection}
    /></I18nProvider>);

    expect(screen.getByRole("button", { name: /Corner 6/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Straights" }));
    expect(onFilter).toHaveBeenCalledWith("straights");
    await user.click(screen.getByRole("button", { name: /Corner 7/ }));
    expect(onSection).toHaveBeenCalledWith("c7");
  });
});
