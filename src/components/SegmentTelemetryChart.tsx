import { useMemo, useState } from "react";
import type { SegmentAxis } from "../app/useSegmentWorkbench";
import type { SegmentAnalysisResult, SegmentTrajectorySample } from "../domain/types";
import { ChartPanel } from "./ChartPanel";
import { buildSegmentTelemetryOption } from "./segmentTelemetryOptions";

interface SegmentTelemetryChartProps {
  analysis: SegmentAnalysisResult;
  overlayLapIds: string[];
  focusedLapId?: string;
  referenceLapId?: string;
  axis: SegmentAxis;
  onRange: (startDistanceMeters: number, endDistanceMeters: number) => void;
  onReset: () => void;
  onCursorDistance: (distanceMeters: number) => void;
}

export function SegmentTelemetryChart({
  analysis,
  overlayLapIds,
  focusedLapId,
  referenceLapId,
  axis,
  onRange,
  onReset,
  onCursorDistance,
}: SegmentTelemetryChartProps) {
  const [interaction, setInteraction] = useState<"range" | "zoom">("range");
  const option = useMemo(() => buildSegmentTelemetryOption(
    analysis,
    overlayLapIds,
    axis,
    focusedLapId,
    referenceLapId,
  ), [analysis, axis, focusedLapId, overlayLapIds, referenceLapId]);
  const focused = analysis.records.find((record) => record.lapId === focusedLapId)
    ?? analysis.records.find((record) => record.lapId === referenceLapId);

  const selectRange = (start: number, end: number) => {
    const distances = axis === "distance"
      ? [start, end]
      : [timeToDistance(focused?.trajectory ?? [], start), timeToDistance(focused?.trajectory ?? [], end)];
    onRange(
      analysis.range.startDistanceMeters + Math.min(...distances),
      analysis.range.startDistanceMeters + Math.max(...distances),
    );
  };

  const selectPoint = (sourceIndex: number) => {
    const sample = focused?.trajectory.find((candidate) => candidate.sourceIndex === sourceIndex);
    if (sample) onCursorDistance(sample.distanceMeters);
  };

  return (
    <ChartPanel
      title="Speed, elapsed time, Delta-T & Time Slip Rate"
      ariaLabel={`Synchronized segment telemetry by ${axis}`}
      className="segment-telemetry-panel"
      option={option}
      onPoint={selectPoint}
      onBrushRange={interaction === "range" ? selectRange : undefined}
      actions={(
        <div className="segmented-control" role="group" aria-label="Graph drag behavior">
          <button type="button" aria-pressed={interaction === "range"} onClick={() => setInteraction("range")}>Select range</button>
          <button type="button" aria-pressed={interaction === "zoom"} onClick={() => setInteraction("zoom")}>Zoom</button>
          <button type="button" onClick={onReset}>Reset</button>
        </div>
      )}
    />
  );
}

function timeToDistance(samples: SegmentTrajectorySample[], elapsedSeconds: number): number {
  if (!samples.length) return 0;
  return samples.reduce((nearest, sample) =>
    Math.abs(sample.elapsedSeconds - elapsedSeconds) < Math.abs(nearest.elapsedSeconds - elapsedSeconds) ? sample : nearest,
  samples[0]).distanceMeters;
}
