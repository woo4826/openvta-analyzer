import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EChartsOption } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => {
  const zr = {
    add: vi.fn(),
    refresh: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  const chart = {
  setOption: vi.fn(),
  dispatchAction: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  convertToPixel: vi.fn(() => 0),
  convertFromPixel: vi.fn(() => 125),
  containPixel: vi.fn(() => true),
  getHeight: vi.fn(() => 200),
    getZr: vi.fn(() => zr),
  };
  return { chart, zr };
});
const chartDouble = doubles.chart;
const zrDouble = doubles.zr;

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
    Object.values(zrDouble).forEach((value) => value.mockClear());
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
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

  it("tracks ordinary plot movement through ZRender without requiring a series hit", () => {
    const onHoverDomain = vi.fn();
    const option: EChartsOption = {
      grid: [{ top: 20, height: 120 }],
      xAxis: [{ type: "value" }],
      yAxis: [{ type: "value" }],
      series: [{ type: "line", data: [[0, 1], [250, 2]] }],
    };
    const view = render(<ChartPanel title="Telemetry" option={option} onHoverDomain={onHoverDomain} />);
    const pointerHandler = zrDouble.on.mock.calls.find(([event]) => event === "mousemove")?.[1] as ((event: { offsetX: number; offsetY: number }) => void) | undefined;

    expect(pointerHandler).toBeTypeOf("function");
    pointerHandler?.({ offsetX: 240, offsetY: 80 });

    expect(chartDouble.containPixel).toHaveBeenCalledWith({ gridIndex: "all" }, [240, 80]);
    expect(chartDouble.convertFromPixel).toHaveBeenCalledWith({ xAxisIndex: 0 }, 240);
    expect(onHoverDomain).toHaveBeenCalledWith(125);
    expect(chartDouble.convertToPixel).toHaveBeenCalledWith({ xAxisIndex: 0 }, 125);

    view.unmount();
    expect(zrDouble.off).toHaveBeenCalledWith("mousemove", pointerHandler);
  });

  it("ignores pointer movement outside every plot grid", () => {
    chartDouble.containPixel.mockReturnValueOnce(false);
    const onHoverDomain = vi.fn();
    render(<ChartPanel title="Telemetry" option={{}} onHoverDomain={onHoverDomain} />);
    const pointerHandler = zrDouble.on.mock.calls.find(([event]) => event === "mousemove")?.[1] as ((event: { offsetX: number; offsetY: number }) => void) | undefined;

    pointerHandler?.({ offsetX: 10, offsetY: 10 });

    expect(chartDouble.convertFromPixel).not.toHaveBeenCalled();
    expect(onHoverDomain).not.toHaveBeenCalled();
  });

  it("emits normalized direct and batched data zoom windows", () => {
    const onZoomWindow = vi.fn();
    render(<ChartPanel
      title="Speed"
      option={{ dataZoom: [{ type: "inside" }] }}
      onZoomWindow={onZoomWindow}
    />);
    const zoomHandler = chartDouble.on.mock.calls.find(([event]) => event === "datazoom")?.[1] as ((payload: unknown) => void) | undefined;

    zoomHandler?.({ start: 12, end: 78 });
    zoomHandler?.({ batch: [{ start: 20, end: 60 }] });
    zoomHandler?.({ start: 90, end: 40 });
    zoomHandler?.({ start: -1, end: 50 });

    expect(onZoomWindow.mock.calls).toEqual([
      [{ start: 12, end: 78 }],
      [{ start: 20, end: 60 }],
    ]);
  });

  it("emits a horizontal brush range and clears the finished selection", () => {
    const onBrushRange = vi.fn();
    render(<ChartPanel
      title="Speed"
      option={{ series: [{ type: "line", data: [[0, 1], [100, 2]] }] }}
      interactionMode="range"
      onBrushRange={onBrushRange}
    />);
    const brushHandler = chartDouble.on.mock.calls.find(([event]) => event === "brushSelected")?.[1] as ((payload: unknown) => void) | undefined;

    brushHandler?.({ batch: [{ areas: [{ coordRange: [75, 25] }] }] });

    expect(onBrushRange).toHaveBeenCalledWith(25, 75);
    expect(chartDouble.dispatchAction).toHaveBeenCalledWith({ type: "brush", areas: [] });
  });

  it("supports keyboard cursor traversal without hiding the chart semantics", async () => {
    const user = userEvent.setup();
    const onCursorKey = vi.fn();
    render(<ChartPanel title="Telemetry" ariaLabel="Synchronized telemetry" option={{}} describedBy="chart-help" onCursorKey={onCursorKey} />);

    const chart = screen.getByRole("img", { name: "Synchronized telemetry" });
    expect(chart).toHaveAttribute("tabindex", "0");
    expect(chart).toHaveAttribute("aria-describedby", "chart-help");
    await user.click(chart);
    await user.keyboard("{ArrowRight}{PageDown}{End}{ArrowLeft}{PageUp}{Home}");

    expect(onCursorKey.mock.calls.map(([action]) => action)).toEqual([
      "next", "page-next", "end", "previous", "page-previous", "start",
    ]);
  });
});
