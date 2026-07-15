import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultSegmentWorkbenchPreferences } from "../../domain/segmentWorkbenchPreferences";
import { I18nProvider } from "../../i18n/I18nProvider";
import { DashboardWidget } from "../DashboardWidget";
import { SegmentDashboard } from "../SegmentDashboard";

describe("SegmentDashboard", () => {
  it("renders visible widgets with dedicated drag handles", () => {
    const preferences = defaultSegmentWorkbenchPreferences();
    preferences.visibleWidgets.evidence = false;

    render(
      <I18nProvider>
        <SegmentDashboard layouts={preferences.layouts} visibleWidgets={preferences.visibleWidgets} onLayouts={vi.fn()}>
          {{
            evidence: <DashboardWidget id="evidence" title="Evidence">evidence</DashboardWidget>,
            map: <DashboardWidget id="map" title="Map">map</DashboardWidget>,
            telemetry: <DashboardWidget id="telemetry" title="Telemetry">graph</DashboardWidget>,
          }}
        </SegmentDashboard>
      </I18nProvider>,
    );

    expect(screen.queryByRole("region", { name: "Evidence" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Map" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Move Map widget" })).toHaveClass("dashboard-widget-handle");
    expect(screen.getByRole("region", { name: "Telemetry" })).toBeVisible();
  });

  it("retains the supplied layout identity when the grid reports an initial layout", () => {
    const preferences = defaultSegmentWorkbenchPreferences();
    const onLayouts = vi.fn();
    render(
      <SegmentDashboard layouts={preferences.layouts} visibleWidgets={preferences.visibleWidgets} onLayouts={onLayouts}>
        {{ map: <div>map</div>, telemetry: <div>telemetry</div> }}
      </SegmentDashboard>,
    );

    if (onLayouts.mock.calls.length) {
      const reported = onLayouts.mock.calls.at(-1)?.[0] as typeof preferences.layouts;
      expect(reported.lg.map((item) => item.i)).toEqual(preferences.layouts.lg.map((item) => item.i));
    }
  });
});
