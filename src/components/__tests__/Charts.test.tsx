import type { EChartsOption } from "echarts";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Charts, type AccelerationSensorSet } from "../Charts";
import type { SensorPoint, VtaFile } from "../../domain/types";

interface CapturedChart {
  title: string;
  option: EChartsOption;
}

const capturedCharts = vi.hoisted((): CapturedChart[] => []);

vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ title, option }: CapturedChart) => {
    capturedCharts.push({ title, option });
    return <div data-testid={`chart-${title}`}>{title}</div>;
  },
}));

describe("Charts acceleration options", () => {
  beforeEach(() => {
    capturedCharts.length = 0;
  });

  it("labels acceleration series with the active transform meaning", () => {
    render(
      <Charts
        file={file()}
        sensors={[sensor({ elapsedSeconds: 1.5, accelX: 9.80665, accelY: 0, accelZ: 19.6133, accelUnit: "mps2" })]}
        selectedPointIndex={0}
        onSelectedPointIndex={() => undefined}
        transformMode="calibrated"
      />,
    );

    const accelerationSeries = optionSeries(chartOption("Acceleration"));
    expect(accelerationSeries.map((series) => series.name)).toEqual(["Calibrated GX", "Calibrated GY", "Calibrated GZ"]);
    expect(accelerationSeries[0].data).toEqual([[1.5, 1]]);
    expect(accelerationSeries[2].data).toEqual([[1.5, 2]]);
  });

  it("builds compare acceleration options for raw, calibrated, and filtered series", () => {
    const accelerationSensorSets: AccelerationSensorSet[] = [
      { label: "Raw", sensors: [sensor({ accelX: 1, accelY: 2, accelZ: 3 })] },
      { label: "Calibrated", sensors: [sensor({ accelX: 4, accelY: 5, accelZ: 6 })] },
      { label: "Filtered", sensors: [sensor({ accelX: 7, accelY: 8, accelZ: 9 })] },
    ];

    render(
      <Charts
        file={file()}
        sensors={accelerationSensorSets[2].sensors}
        accelerationSensorSets={accelerationSensorSets}
        selectedPointIndex={0}
        onSelectedPointIndex={() => undefined}
        transformMode="compare"
      />,
    );

    const expectedAccelerationNames = [
      "Raw GX",
      "Raw GY",
      "Raw GZ",
      "Calibrated GX",
      "Calibrated GY",
      "Calibrated GZ",
      "Filtered GX",
      "Filtered GY",
      "Filtered GZ",
    ];
    expect(seriesNames(chartOption("Acceleration"))).toEqual(expectedAccelerationNames);
    expect(seriesNames(chartOption("Velocity + Acceleration"))).toEqual(["Velocity", ...expectedAccelerationNames]);
  });
});

function chartOption(title: string): EChartsOption {
  const chart = capturedCharts.find((item) => item.title === title);
  if (!chart) {
    throw new Error(`Expected ${title} chart to be rendered.`);
  }
  return chart.option;
}

function seriesNames(option: EChartsOption): string[] {
  return optionSeries(option).map((series) => String(series.name));
}

function optionSeries(option: EChartsOption): Array<{ name?: unknown; data?: unknown }> {
  if (!option.series) {
    return [];
  }
  return Array.isArray(option.series)
    ? (option.series as Array<{ name?: unknown; data?: unknown }>)
    : [option.series as { name?: unknown; data?: unknown }];
}

function sensor(overrides: Partial<SensorPoint> = {}): SensorPoint {
  return {
    index: 0,
    lineNumber: 1,
    rawLine: "",
    elapsedSeconds: 0,
    eventCode: 1,
    accelX: 0,
    accelY: 0,
    accelZ: 0,
    accelUnit: "g",
    ...overrides,
  };
}

function file(): VtaFile {
  return {
    sourceName: "test.Vta",
    detectedFormat: "modern-openvta",
    headers: [],
    rawLines: [],
    gpsPoints: [],
    enhancedPoints: [],
    sensorPoints: [],
    parseWarnings: [],
  };
}
