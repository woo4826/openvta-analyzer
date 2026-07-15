import { describe, expect, it } from "vitest";
import { analyzeLapOpportunities } from "../opportunityAnalysis";
import type { LapSectionResult, TrackSection } from "../types";

describe("lap opportunity analysis", () => {
  it("ranks the selected lap's largest actionable section losses", () => {
    const summary = analyzeLapOpportunities("lap-a", sections, [
      result("lap-a", "corner-1", 6.4, { entry: 91, minimum: 62, exit: 78 }),
      result("lap-b", "corner-1", 6.0, { entry: 93, minimum: 64, exit: 88 }),
      result("lap-a", "corner-2", 8.0, { entry: 99, minimum: 50, exit: 82 }),
      result("lap-b", "corner-2", 7.2, { entry: 100, minimum: 61, exit: 84 }),
      result("lap-a", "straight-1", 4.15, { entry: 100, minimum: 100, exit: 145 }),
      result("lap-b", "straight-1", 4.0, { entry: 106, minimum: 105, exit: 147 }),
      result("lap-a", "straight-2", 5.02, { entry: 140, minimum: 140, exit: 170 }),
      result("lap-b", "straight-2", 5.0, { entry: 141, minimum: 140, exit: 170 }),
    ], 3);

    expect(summary.opportunities.map((item) => item.sectionId)).toEqual(["corner-2", "corner-1", "straight-1"]);
    expect(summary.opportunities.map((item) => item.cause)).toEqual(["minimum-speed", "exit-speed", "entry-speed"]);
    expect(summary.opportunities.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(summary.potentialGainSeconds).toBeCloseTo(1.35);
    expect(summary.analyzedSectionCount).toBe(4);
    expect(summary.opportunities[0]).toMatchObject({ bestLapId: "lap-b", speedDeficitKmh: 11 });
  });

  it("uses only eligible results as best references while still analyzing a partial selected lap", () => {
    const summary = analyzeLapOpportunities("partial", sections.slice(0, 1), [
      result("partial", "corner-1", 6.5, { exit: 80 }, { eligibleForBest: false, fromPartialLap: true }),
      result("partial-fast", "corner-1", 5.5, { exit: 90 }, { eligibleForBest: false, fromPartialLap: true }),
      result("lap-b", "corner-1", 6.0, { exit: 88 }),
    ]);

    expect(summary.opportunities).toHaveLength(1);
    expect(summary.opportunities[0]).toMatchObject({ bestLapId: "lap-b", lostSeconds: 0.5 });
  });

  it("returns an honest empty summary when the lap or eligible references are unavailable", () => {
    expect(analyzeLapOpportunities("missing", sections, [])).toEqual({
      lapId: "missing",
      potentialGainSeconds: 0,
      analyzedSectionCount: 0,
      opportunities: [],
    });
    expect(analyzeLapOpportunities(undefined, sections, [])).toEqual({
      lapId: undefined,
      potentialGainSeconds: 0,
      analyzedSectionCount: 0,
      opportunities: [],
    });
  });
});

const sections: TrackSection[] = [
  { id: "corner-1", name: "Corner 1", kind: "corner-right", startDistanceMeters: 0, endDistanceMeters: 100 },
  { id: "corner-2", name: "Corner 2", kind: "corner-left", startDistanceMeters: 100, endDistanceMeters: 200 },
  { id: "straight-1", name: "Straight 1", kind: "straight", startDistanceMeters: 200, endDistanceMeters: 300 },
  { id: "straight-2", name: "Straight 2", kind: "straight", startDistanceMeters: 300, endDistanceMeters: 400 },
];

function result(
  lapId: string,
  sectionId: string,
  durationSeconds: number,
  speeds: Partial<{ entry: number; minimum: number; average: number; maximum: number; exit: number }> = {},
  overrides: Partial<LapSectionResult> = {},
): LapSectionResult {
  const section = sections.find((item) => item.id === sectionId)!;
  return {
    id: `${lapId}-${sectionId}`,
    lapId,
    sectionId,
    name: section.name,
    kind: section.kind,
    durationSeconds,
    entrySpeedKmh: speeds.entry ?? 100,
    minimumSpeedKmh: speeds.minimum ?? 70,
    averageSpeedKmh: speeds.average ?? 85,
    maximumSpeedKmh: speeds.maximum ?? 110,
    exitSpeedKmh: speeds.exit ?? 95,
    maxLateralG: 1.1,
    maxDecelerationG: 0.8,
    fromPartialLap: false,
    eligibleForBest: true,
    ...overrides,
  };
}
