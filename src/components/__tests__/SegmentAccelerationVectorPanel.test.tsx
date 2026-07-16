import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import type { SynchronizedAccelerationSeries } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";

vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ title, ariaLabel, option, actions, caption }: {
    title: string;
    ariaLabel?: string;
    option: EChartsOption;
    actions?: ReactNode;
    caption?: ReactNode;
  }) => <section data-testid="vector-chart-panel">
    <h3>{title}</h3>
    {actions}
    <div role="img" aria-label={ariaLabel ?? title} data-option={JSON.stringify(option)} />
    {caption}
  </section>,
}));

import { SegmentAccelerationVectorPanel } from "../SegmentAccelerationVectorPanel";

describe("SegmentAccelerationVectorPanel", () => {
  it("defaults to a controlled 2D G-G diagram with focused/reference values", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "2D G-G" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "3D vector" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("img", { name: "Device X and Y acceleration at the synchronized cursor" })).toBeVisible();
    expect(screen.getByText("+0.10 g")).toBeVisible();
    expect(screen.getByText("-0.20 g")).toBeVisible();
    expect(screen.getByText("+1.05 g")).toBeVisible();
    expect(screen.getByText("0.22 g")).toBeVisible();
    expect(screen.getByText(/Reference lap.*Device X.*-0.15 g/s)).toBeVisible();
  });

  it("requests the optional 3D mode without changing the controlled selection", () => {
    const onMode = vi.fn();
    renderPanel({ onMode });

    fireEvent.click(screen.getByRole("button", { name: "3D vector" }));

    expect(onMode).toHaveBeenCalledWith("vector-3d");
    expect(screen.getByRole("button", { name: "2D G-G" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the focused vector usable when reference acceleration is missing", () => {
    renderPanel({ reference: undefined });

    expect(screen.getByRole("img", { name: "Device X and Y acceleration at the synchronized cursor" })).toBeVisible();
    expect(screen.getByText("Reference acceleration unavailable at this cursor")).toBeVisible();
    expect(screen.getByText("+0.10 g")).toBeVisible();
  });

  it("shows a stable unavailable panel when focused acceleration is missing", () => {
    renderPanel({ focused: undefined, reference: undefined });

    expect(screen.getByText("Measured acceleration unavailable")).toBeVisible();
    expect(screen.queryByRole("img", { name: "Device X and Y acceleration at the synchronized cursor" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2D G-G" })).toBeVisible();
    expect(screen.getByRole("button", { name: "3D vector" })).toBeVisible();
  });
});

function renderPanel(overrides: Partial<Parameters<typeof SegmentAccelerationVectorPanel>[0]> = {}) {
  const props: Parameters<typeof SegmentAccelerationVectorPanel>[0] = {
    focused: acceleration([0, 50, 100], [[0, 0, 1], [0.1, -0.2, 1.05], [0.2, -0.3, 1.1]]),
    reference: acceleration([0, 48, 96], [[0, 0, 1], [-0.15, -0.1, 1.02], [0.1, -0.25, 1.08]]),
    cursorDistanceMeters: 50,
    mode: "gg-2d",
    onMode: vi.fn(),
    ...overrides,
  };
  return render(<I18nProvider><SegmentAccelerationVectorPanel {...props} /></I18nProvider>);
}

function acceleration(distances: number[], values: number[][]): SynchronizedAccelerationSeries {
  return {
    method: "sensor-clock",
    samples: distances.map((distanceMeters, index) => ({
      sensorIndex: index,
      sourceIndex: index + 10,
      distanceMeters,
      elapsedSeconds: index * 2,
      accelXG: values[index][0],
      accelYG: values[index][1],
      accelZG: values[index][2],
    })),
  };
}
