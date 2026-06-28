import { Flag, FlagTriangleRight, ScanLine, SquareDashed, X } from "lucide-react";
import type { MapSettings } from "../domain/types";
import { Field, IconButton } from "./ui";

interface MapControlsProps {
  settings: MapSettings;
  hasPoints: boolean;
  hasSegment: boolean;
  onFitRoute: () => void;
  onSetSegmentStart: () => void;
  onSetSegmentEnd: () => void;
  onClearSegment: () => void;
  onCreateRegion: () => void;
  onSettingsChange: (settings: MapSettings) => void;
}

const MIN_POINT_SIZE = 2;
const MAX_POINT_SIZE = 14;

export function MapControls({
  settings,
  hasPoints,
  hasSegment,
  onFitRoute,
  onSetSegmentStart,
  onSetSegmentEnd,
  onClearSegment,
  onCreateRegion,
  onSettingsChange,
}: MapControlsProps) {
  const pointSize = clampPointSize(settings.pointSize);

  function updatePointSize(value: number) {
    onSettingsChange({ ...settings, pointSize: clampPointSize(value) });
  }

  return (
    <div className="map-toolbar" aria-label="Map analysis controls">
      <div className="map-control-group" role="group" aria-label="Route controls">
        <IconButton label="Fit route" icon={<ScanLine size={15} aria-hidden />} onClick={onFitRoute} disabled={!hasPoints} />
        <IconButton
          label="Set segment start"
          icon={<Flag size={15} aria-hidden />}
          onClick={onSetSegmentStart}
          disabled={!hasPoints}
        />
        <IconButton
          label="Set segment end"
          icon={<FlagTriangleRight size={15} aria-hidden />}
          onClick={onSetSegmentEnd}
          disabled={!hasPoints}
        />
        <IconButton label="Clear segment" icon={<X size={15} aria-hidden />} onClick={onClearSegment} disabled={!hasSegment} />
        <IconButton
          label="Create region"
          icon={<SquareDashed size={15} aria-hidden />}
          onClick={onCreateRegion}
          disabled={!hasPoints}
        />
      </div>
      <Field label="Point size" htmlFor="map-point-size" className="map-point-size">
        <input
          id="map-point-size"
          aria-label="Point size"
          type="number"
          min={MIN_POINT_SIZE}
          max={MAX_POINT_SIZE}
          step={1}
          value={pointSize}
          onChange={(event) => updatePointSize(event.currentTarget.valueAsNumber)}
        />
      </Field>
    </div>
  );
}

function clampPointSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 6;
  }
  return Math.min(MAX_POINT_SIZE, Math.max(MIN_POINT_SIZE, Math.round(value)));
}
