import type { ActiveSegment, SourceVisibility, TransformMode } from "../domain/types";
import { Panel, SegmentedControl, ToolbarButton } from "./ui";

interface WorkspaceStatusProps {
  sourceVisibility: SourceVisibility;
  onSourceVisibility: (visibility: SourceVisibility) => void;
  transformMode: TransformMode;
  onTransformMode: (mode: TransformMode) => void;
  activeSegment?: ActiveSegment;
  onActiveSegment: (segment?: ActiveSegment) => void;
}

const transformOptions: Array<{ value: TransformMode; label: string }> = [
  { value: "raw", label: "Raw" },
  { value: "calibrated", label: "Calibrated" },
  { value: "filtered", label: "Filtered" },
  { value: "compare", label: "Compare" },
];

export function WorkspaceStatus({
  sourceVisibility,
  onSourceVisibility,
  transformMode,
  onTransformMode,
  activeSegment,
  onActiveSegment,
}: WorkspaceStatusProps) {
  function toggleSource(key: keyof SourceVisibility) {
    const next = { ...sourceVisibility, [key]: !sourceVisibility[key] };
    if (!next.rawGps && !next.enhancedGps) {
      return;
    }
    onSourceVisibility(next);
    onActiveSegment(undefined);
  }

  return (
    <Panel title="Workspace">
      <div className="content-band">
        <div>
          <span className="panel-eyebrow">Sources</span>
          <div className="row-actions">
            <ToolbarButton
              aria-pressed={sourceVisibility.rawGps}
              variant={sourceVisibility.rawGps ? "primary" : "default"}
              onClick={() => toggleSource("rawGps")}
            >
              Raw GPS
            </ToolbarButton>
            <ToolbarButton
              aria-pressed={sourceVisibility.enhancedGps}
              variant={sourceVisibility.enhancedGps ? "primary" : "default"}
              onClick={() => toggleSource("enhancedGps")}
            >
              Enhanced
            </ToolbarButton>
          </div>
        </div>

        <div>
          <span className="panel-eyebrow">Transform</span>
          <SegmentedControl
            ariaLabel="Transform mode"
            options={transformOptions}
            value={transformMode}
            onChange={(value) => onTransformMode(value as TransformMode)}
            selectionRole="button"
          />
        </div>

        <div className="metric">
          <span>Segment</span>
          <strong>
            {activeSegment
              ? `${activeSegment.startIndex}-${activeSegment.endIndex}`
              : "All points"}
          </strong>
        </div>
      </div>
    </Panel>
  );
}
