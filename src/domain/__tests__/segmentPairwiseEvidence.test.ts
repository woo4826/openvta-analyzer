import { describe, expect, it } from "vitest";
import type { SegmentLapRecord } from "../types";
import { buildSegmentPairwiseEvidence } from "../segmentPairwiseEvidence";

describe("buildSegmentPairwiseEvidence", () => {
  it("compares the focused lap directly with the selected reference", () => {
    const focused = record({
      durationSeconds: 10.314,
      entrySpeedKmh: 124.1,
      minimumSpeedKmh: 78.7,
      exitSpeedKmh: 113.3,
      drivenDistanceMeters: 332.1,
    });
    const reference = record({
      durationSeconds: 13,
      entrySpeedKmh: 100,
      minimumSpeedKmh: 40,
      exitSpeedKmh: 110,
      drivenDistanceMeters: 320,
    });

    expect(buildSegmentPairwiseEvidence(focused, reference)).toEqual({
      timeDeltaSeconds: -2.686,
      entrySpeedDeltaKmh: 24.1,
      minimumSpeedDeltaKmh: 38.7,
      exitSpeedDeltaKmh: 3.3,
      drivenDistanceDeltaMeters: 12.1,
    });
  });

  it("keeps missing measurements undefined and requires both roles", () => {
    expect(buildSegmentPairwiseEvidence(record({ durationSeconds: 10 }), record({ durationSeconds: undefined }))).toMatchObject({
      timeDeltaSeconds: undefined,
      entrySpeedDeltaKmh: undefined,
    });
    expect(buildSegmentPairwiseEvidence(record(), undefined)).toBeUndefined();
  });
});

function record(overrides: Partial<SegmentLapRecord> = {}): SegmentLapRecord {
  return {
    lapId: "lap-1",
    ordinal: 1,
    completion: "complete",
    validity: "valid",
    flags: [],
    fromPartialLap: false,
    coverage: "complete",
    eligibleForBest: true,
    gpsConfidence: "high",
    trajectory: [],
    ...overrides,
  };
}
