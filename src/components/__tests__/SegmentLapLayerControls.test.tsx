import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LapMapLayerStyle } from "../../domain/lapMapLayers";
import { I18nProvider } from "../../i18n/I18nProvider";
import { SegmentLapLayerControls } from "../SegmentLapLayerControls";

describe("SegmentLapLayerControls", () => {
  it("edits visibility, color, line style, and opacity for each lap", async () => {
    const user = userEvent.setup();
    const onLayer = vi.fn();
    render(<I18nProvider><SegmentLapLayerControls
      layers={layers()}
      onLayer={onLayer}
      onShowComparison={vi.fn()}
      onShowAll={vi.fn()}
      onReset={vi.fn()}
    /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Lap layers" }));
    expect(screen.getByRole("dialog", { name: "Lap layers" })).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Lap 3 visible" }));
    expect(onLayer).toHaveBeenCalledWith("lap-3", { visible: true });

    await user.selectOptions(screen.getByRole("combobox", { name: "Lap 3 line style" }), "solid");
    expect(onLayer).toHaveBeenCalledWith("lap-3", { lineStyle: "solid" });

    fireEvent.change(screen.getByLabelText("Lap 3 opacity"), { target: { value: "31" } });
    expect(onLayer).toHaveBeenLastCalledWith("lap-3", { opacity: 0.31 });

    expect(screen.getByLabelText("Lap 3 color")).toHaveAttribute("type", "color");
  });

  it("offers comparison, all-lap, and automatic-style recovery actions", async () => {
    const user = userEvent.setup();
    const onShowComparison = vi.fn();
    const onShowAll = vi.fn();
    const onReset = vi.fn();
    render(<I18nProvider><SegmentLapLayerControls
      layers={layers()}
      onLayer={vi.fn()}
      onShowComparison={onShowComparison}
      onShowAll={onShowAll}
      onReset={onReset}
    /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Lap layers" }));
    await user.click(screen.getByRole("button", { name: "Show comparison" }));
    await user.click(screen.getByRole("button", { name: "Show all" }));
    await user.click(screen.getByRole("button", { name: "Auto styles" }));

    expect(onShowComparison).toHaveBeenCalledOnce();
    expect(onShowAll).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });
});

function layers(): LapMapLayerStyle[] {
  return [
    { id: "lap-1", ordinal: 1, role: "reference", visible: true, color: "#2563eb", lineStyle: "dashed", opacity: 0.9, width: 3.5 },
    { id: "lap-2", ordinal: 2, role: "focused", visible: true, color: "#dc2626", lineStyle: "solid", opacity: 1, width: 4 },
    { id: "lap-3", ordinal: 3, role: "other", visible: false, color: "#059669", lineStyle: "dotted", opacity: 0.5, width: 2.5 },
  ];
}
