import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { interpolate, languages, translations } from "../../i18n/locales";
import { I18nContext } from "../../i18n/useI18n";
import { WorkspaceStatus } from "../WorkspaceStatus";

describe("WorkspaceStatus", () => {
  it("exposes unavailable sources, meaningful transforms, and segment actions", async () => {
    const user = userEvent.setup();
    const onOpenCalibration = vi.fn();
    const onActiveSegment = vi.fn();

    renderWithI18n(
      <WorkspaceStatus
        sourceVisibility={{ rawGps: true, enhancedGps: false }}
        onSourceVisibility={vi.fn()}
        rawGpsCount={1589}
        enhancedGpsCount={0}
        sensorCount={2400}
        transformMode="raw"
        onTransformMode={vi.fn()}
        calibrationReady={false}
        filterReady={false}
        onOpenCalibration={onOpenCalibration}
        activeSegment={{ startIndex: 99, endIndex: 199, source: "map" }}
        visiblePointCount={1589}
        onActiveSegment={onActiveSegment}
      />,
    );

    expect(screen.getByRole("button", { name: "Raw GPS (1,589)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Raw GPS (1,589)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Enhanced (0)" })).toBeDisabled();
    expect(screen.getByText("Sensor rows: 2,400")).toBeVisible();
    expect(screen.getByRole("button", { name: "Calibrated" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Filtered" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
    expect(screen.getByText("Sensor transforms affect charts, tables, and exports, not GPS or lap geometry.")).toBeVisible();
    expect(screen.getByText("100–200 of 1,589")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Set up calibration and filtering" }));
    expect(onOpenCalibration).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Reset segment" }));
    expect(onActiveSegment).toHaveBeenCalledWith(undefined);
  });

  it("switches GPS sources exclusively in single-source mode", async () => {
    const user = userEvent.setup();
    const onSourceVisibility = vi.fn();
    const onActiveSegment = vi.fn();

    const { rerender } = renderWithI18n(
      <WorkspaceStatus
        sourceVisibility={{ rawGps: false, enhancedGps: true }}
        onSourceVisibility={onSourceVisibility}
        rawGpsCount={100}
        enhancedGpsCount={80}
        sensorCount={0}
        transformMode="raw"
        onTransformMode={vi.fn()}
        calibrationReady={false}
        filterReady={false}
        onOpenCalibration={vi.fn()}
        visiblePointCount={80}
        onActiveSegment={onActiveSegment}
        singleSourceMode
      />,
    );

    await user.click(screen.getByRole("button", { name: "Raw GPS (100)" }));
    expect(onSourceVisibility).toHaveBeenLastCalledWith({ rawGps: true, enhancedGps: false });
    expect(onActiveSegment).toHaveBeenLastCalledWith(undefined);

    rerender(withI18n(
      <WorkspaceStatus
        sourceVisibility={{ rawGps: true, enhancedGps: false }}
        onSourceVisibility={onSourceVisibility}
        rawGpsCount={100}
        enhancedGpsCount={80}
        sensorCount={0}
        transformMode="raw"
        onTransformMode={vi.fn()}
        calibrationReady={false}
        filterReady={false}
        onOpenCalibration={vi.fn()}
        visiblePointCount={100}
        onActiveSegment={onActiveSegment}
        singleSourceMode
      />,
    ));

    await user.click(screen.getByRole("button", { name: "Enhanced (80)" }));
    expect(onSourceVisibility).toHaveBeenLastCalledWith({ rawGps: false, enhancedGps: true });
  });

  it("preserves multi-source toggling outside single-source mode", async () => {
    const user = userEvent.setup();
    const onSourceVisibility = vi.fn();

    renderWithI18n(
      <WorkspaceStatus
        sourceVisibility={{ rawGps: true, enhancedGps: false }}
        onSourceVisibility={onSourceVisibility}
        rawGpsCount={100}
        enhancedGpsCount={80}
        sensorCount={0}
        transformMode="raw"
        onTransformMode={vi.fn()}
        calibrationReady={false}
        filterReady={false}
        onOpenCalibration={vi.fn()}
        visiblePointCount={100}
        onActiveSegment={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Enhanced (80)" }));
    expect(onSourceVisibility).toHaveBeenCalledWith({ rawGps: true, enhancedGps: true });
  });
});

function renderWithI18n(children: ReactElement) {
  return render(withI18n(children));
}

function withI18n(children: ReactElement) {
  return (
    <I18nContext.Provider
      value={{
        language: "en",
        setLanguage: () => undefined,
        languages,
        t: (key, values) => interpolate(translations.en[key], values),
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}
