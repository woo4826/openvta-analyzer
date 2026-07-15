import type { SegmentLapRecord } from "./types";

export interface SegmentPairwiseEvidence {
  timeDeltaSeconds?: number;
  entrySpeedDeltaKmh?: number;
  minimumSpeedDeltaKmh?: number;
  exitSpeedDeltaKmh?: number;
  drivenDistanceDeltaMeters?: number;
}

export function buildSegmentPairwiseEvidence(
  focused?: SegmentLapRecord,
  reference?: SegmentLapRecord,
): SegmentPairwiseEvidence | undefined {
  if (!focused || !reference) return undefined;
  return {
    timeDeltaSeconds: difference(focused.durationSeconds, reference.durationSeconds),
    entrySpeedDeltaKmh: difference(focused.entrySpeedKmh, reference.entrySpeedKmh),
    minimumSpeedDeltaKmh: difference(focused.minimumSpeedKmh, reference.minimumSpeedKmh),
    exitSpeedDeltaKmh: difference(focused.exitSpeedKmh, reference.exitSpeedKmh),
    drivenDistanceDeltaMeters: difference(focused.drivenDistanceMeters, reference.drivenDistanceMeters),
  };
}

function difference(focused: number | undefined, reference: number | undefined): number | undefined {
  return focused === undefined || reference === undefined
    ? undefined
    : Math.round((focused - reference) * 1000) / 1000;
}
