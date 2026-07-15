import type { EChartsOption } from "echarts";
import { describe, expect, it } from "vitest";
import { brushSegmentFromOption, chartPointIndex } from "../chartInteraction";

describe("ChartPanel source index events", () => {
  it("prefers the third chart coordinate as the GPS source index", () => {
    expect(chartPointIndex({ value: [12.4, 88, 431] })).toBe(431);
    expect(chartPointIndex({ value: [17, 88] })).toBe(17);
  });

  it("resolves brushed data indexes back to GPS source indexes", () => {
    const option: EChartsOption = {
      series: [{
        type: "line",
        data: [[0, 80, 401], [1, 82, 410], [2, 85, 422]],
      }],
    };

    expect(brushSegmentFromOption({
      batch: [{ selected: [{ seriesIndex: 0, dataIndex: [1, 2] }] }],
    }, option)).toEqual({ startIndex: 410, endIndex: 422 });
  });
});
