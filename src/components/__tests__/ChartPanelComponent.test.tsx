import { render } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chartDouble = vi.hoisted(() => ({
  setOption: vi.fn(),
  dispatchAction: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  convertToPixel: vi.fn(() => 0),
  getHeight: vi.fn(() => 200),
  getZr: vi.fn(() => ({ add: vi.fn(), refresh: vi.fn() })),
}));

vi.mock("echarts", () => ({
  init: vi.fn(() => chartDouble),
  graphic: { Line: class Line {} },
}));

import { ChartPanel } from "../ChartPanel";

describe("ChartPanel controlled reset", () => {
  beforeEach(() => {
    Object.values(chartDouble).forEach((value) => {
      if (typeof value === "function" && "mockClear" in value) value.mockClear();
    });
  });

  it("restores every data zoom and clears the active brush when resetToken advances", () => {
    const option: EChartsOption = {
      xAxis: [{ type: "value" }],
      yAxis: [{ type: "value" }],
      series: [{ type: "line", data: [[0, 1], [1, 2]] }],
      dataZoom: [{ type: "inside" }, { type: "slider" }],
    };
    const view = render(<ChartPanel title="Telemetry" option={option} resetToken={0} />);
    chartDouble.dispatchAction.mockClear();

    view.rerender(<ChartPanel title="Telemetry" option={option} resetToken={1} />);

    expect(chartDouble.dispatchAction).toHaveBeenCalledWith({
      type: "dataZoom",
      batch: [
        { dataZoomIndex: 0, start: 0, end: 100 },
        { dataZoomIndex: 1, start: 0, end: 100 },
      ],
    });
    expect(chartDouble.dispatchAction).toHaveBeenCalledWith({ type: "brush", areas: [] });
  });
});
