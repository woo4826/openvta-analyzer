import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsPoint, SensorPoint, SourceVisibility } from "../../domain/types";
import { ONBOARDING_TOUR_STORAGE_KEY } from "../../domain/settings";
import { I18nProvider } from "../../i18n/I18nProvider";

const mocks = vi.hoisted(() => ({
  useLapWorkspace: vi.fn(),
}));

vi.mock("../useLapWorkspace", () => ({
  useLapWorkspace: mocks.useLapWorkspace,
}));

vi.mock("../../components/Overview", () => ({ Overview: () => <div>Overview content</div> }));
vi.mock("../../components/CalibrationPanel", () => ({ CalibrationPanel: () => <div>Calibration content</div> }));
vi.mock("../../components/Tables", () => ({
  Tables: ({ sensors }: { sensors: SensorPoint[] }) => (
    <div data-testid="tables-sensors" data-first-x={sensors[0]?.accelX} data-count={sensors.length} />
  ),
}));
vi.mock("../../components/LapAnalysis", () => ({
  LapAnalysis: ({ points, sourceVisibility }: { points: GpsPoint[]; sourceVisibility: SourceVisibility }) => (
    <div
      data-testid="lap-analysis"
      data-point-count={points.length}
      data-point-sources={[...new Set(points.map((point) => point.source))].join(",")}
      data-source-visibility={`${sourceVisibility.rawGps},${sourceVisibility.enhancedGps}`}
    />
  ),
}));

import { App } from "../App";

describe("App lap GPS source", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      ONBOARDING_TOUR_STORAGE_KEY,
      JSON.stringify({ status: "completed", completedAt: 1, version: 1 }),
    );
    mocks.useLapWorkspace.mockReset().mockReturnValue({
      lookupState: "idle",
      candidates: [],
      sectors: [],
      selectedLapIds: [],
      includePartialLapSectors: false,
      applyProfile: vi.fn(),
    });
  });

  it("opens the Track Library before a VTA is loaded", async () => {
    const user = userEvent.setup();
    render(<I18nProvider><App /></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Track Library" }));

    expect(screen.getByRole("dialog", { name: "Track Library" })).toBeVisible();
  });

  it("analyzes one source, switches it exclusively on the Lap tab, and restores multi-source toggling elsewhere", async () => {
    const user = userEvent.setup();
    render(<I18nProvider><App /></I18nProvider>);

    await user.click(screen.getAllByRole("button", { name: "Load sample" })[0]);
    await user.click(screen.getByRole("tab", { name: "Lap Analysis" }));

    expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-point-count", "35");
    expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-point-sources", "ImuHeading");
    expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-source-visibility", "false,true");
    expect(lastLapWorkspaceCall()).toMatchObject({
      key: expect.stringMatching(/::enhancedGps$/),
      pointCount: 35,
      pointSources: ["ImuHeading"],
    });

    await user.click(screen.getByRole("button", { name: "Raw GPS (37)" }));

    await waitFor(() => {
      expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-point-count", "37");
    });
    expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-point-sources", "RawGps");
    expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-source-visibility", "true,false");
    expect(lastLapWorkspaceCall()).toMatchObject({
      key: expect.stringMatching(/::rawGps$/),
      pointCount: 37,
      pointSources: ["RawGps"],
    });

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("button", { name: "Raw GPS (37)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Enhanced (35)" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Enhanced (35)" }));
    expect(screen.getByRole("button", { name: "Enhanced (35)" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Enhanced (35)" }));
    expect(screen.getByRole("button", { name: "Enhanced (35)" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("tab", { name: "Lap Analysis" }));
    expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-point-count", "37");
    expect(screen.getByTestId("lap-analysis")).toHaveAttribute("data-source-visibility", "true,false");
  });

  it("applies the workspace transform mode to table sensor rows", async () => {
    const user = userEvent.setup();
    render(<I18nProvider><App /></I18nProvider>);

    await user.click(screen.getAllByRole("button", { name: "Load sample" })[0]);
    await user.click(screen.getByRole("tab", { name: "Tables" }));
    const rawFirstX = screen.getByTestId("tables-sensors").getAttribute("data-first-x");

    await user.click(screen.getByRole("button", { name: "Sample CAL" }));
    await user.click(screen.getByRole("button", { name: "Calibrated" }));
    await user.click(screen.getByRole("tab", { name: "Tables" }));

    expect(screen.getByTestId("tables-sensors")).toHaveAttribute("data-count", "185");
    expect(screen.getByTestId("tables-sensors").getAttribute("data-first-x")).not.toBe(rawFirstX);

    await user.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByTestId("tables-sensors")).toHaveAttribute("data-first-x", rawFirstX);
  });
});

function lastLapWorkspaceCall() {
  const [key, , points] = mocks.useLapWorkspace.mock.calls.at(-1) as [string | undefined, string | undefined, GpsPoint[]];
  return {
    key,
    pointCount: points.length,
    pointSources: [...new Set(points.map((point) => point.source))],
  };
}
