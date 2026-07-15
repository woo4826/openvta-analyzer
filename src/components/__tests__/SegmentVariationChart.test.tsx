import { describe, expect, it } from "vitest";
import type { SegmentAnalysisResult } from "../../domain/types";
import { buildSegmentVariationOption } from "../segmentVariationOptions";

describe("segment variation chart", () => {
  it("combines lap-time trend and path-versus-time scatter with focused/reference highlights", () => {
    const option = buildSegmentVariationOption(analysis(), "lap-3", "lap-1", {
      lap: "Lap",
      segmentTime: "Segment time",
      drivenPath: "Driven path",
      focused: "Focused",
      reference: "Reference",
      average: "Average",
    }) as { grid: unknown[]; series: Array<{ id: string; data: number[][] }> };

    expect(option.grid).toHaveLength(2);
    expect(option.series.map((series) => series.id)).toEqual(expect.arrayContaining([
      "lap-time-trend",
      "path-time-scatter",
      "lap-3-trend-highlight",
      "lap-1-scatter-highlight",
    ]));
    expect(option.series.find((series) => series.id === "lap-time-trend")?.data).toHaveLength(3);
  });

  it("uses one highlight when the only lap is both focused and reference", () => {
    const single = analysis();
    single.records = [single.records[0]];
    const option = buildSegmentVariationOption(single, "lap-1", "lap-1", {
      lap: "Lap",
      segmentTime: "Segment time",
      drivenPath: "Driven path",
      focused: "Focused",
      reference: "Reference",
      average: "Average",
    }) as { series: Array<{ id: string }> };

    const ids = option.series.map((series) => series.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.includes("lap-1") && id.includes("highlight"))).toHaveLength(2);
  });
});

function analysis(): SegmentAnalysisResult {
  return {
    scope: { kind: "section", sectionId: "c1" },
    range: { startDistanceMeters: 0, endDistanceMeters: 100 },
    referenceLapId: "lap-1",
    fastestLapId: "lap-1",
    shortestLapId: "lap-2",
    records: [1, 2, 3].map((ordinal) => ({
      lapId: `lap-${ordinal}`,
      ordinal,
      completion: "complete",
      validity: "valid",
      flags: [],
      fromPartialLap: false,
      coverage: "complete",
      eligibleForBest: true,
      durationSeconds: 10 + ordinal,
      drivenDistanceMeters: 100 + ordinal,
      gpsConfidence: "high",
      trajectory: [],
    })),
  };
}
