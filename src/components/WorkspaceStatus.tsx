import type { ActiveSegment, SourceVisibility, TransformMode } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { Panel, SegmentedControl, ToolbarButton } from "./ui";

interface WorkspaceStatusProps {
  sourceVisibility: SourceVisibility;
  onSourceVisibility: (visibility: SourceVisibility) => void;
  transformMode: TransformMode;
  onTransformMode: (mode: TransformMode) => void;
  activeSegment?: ActiveSegment;
  onActiveSegment: (segment?: ActiveSegment) => void;
}

export function WorkspaceStatus({
  sourceVisibility,
  onSourceVisibility,
  transformMode,
  onTransformMode,
  activeSegment,
  onActiveSegment,
}: WorkspaceStatusProps) {
  const { t } = useI18n();
  const transformOptions: Array<{ value: TransformMode; label: string }> = [
    { value: "raw", label: t("workspace.transform.raw") },
    { value: "calibrated", label: t("workspace.transform.calibrated") },
    { value: "filtered", label: t("workspace.transform.filtered") },
    { value: "compare", label: t("workspace.transform.compare") },
  ];

  function toggleSource(key: keyof SourceVisibility) {
    const next = { ...sourceVisibility, [key]: !sourceVisibility[key] };
    if (!next.rawGps && !next.enhancedGps) {
      return;
    }
    onSourceVisibility(next);
    onActiveSegment(undefined);
  }

  return (
    <Panel title={t("workspace.title")}>
      <div className="content-band">
        <div>
          <span className="panel-eyebrow">{t("workspace.sources")}</span>
          <div className="row-actions">
            <ToolbarButton
              aria-pressed={sourceVisibility.rawGps}
              variant={sourceVisibility.rawGps ? "primary" : "default"}
              onClick={() => toggleSource("rawGps")}
            >
              {t("workspace.rawGps")}
            </ToolbarButton>
            <ToolbarButton
              aria-pressed={sourceVisibility.enhancedGps}
              variant={sourceVisibility.enhancedGps ? "primary" : "default"}
              onClick={() => toggleSource("enhancedGps")}
            >
              {t("workspace.enhanced")}
            </ToolbarButton>
          </div>
        </div>

        <div>
          <span className="panel-eyebrow">{t("workspace.transform")}</span>
          <SegmentedControl
            ariaLabel={t("workspace.transformMode")}
            options={transformOptions}
            value={transformMode}
            onChange={(value) => onTransformMode(value as TransformMode)}
            selectionRole="button"
          />
        </div>

        <div className="metric">
          <span>{t("workspace.segment")}</span>
          <strong>
            {activeSegment
              ? `${activeSegment.startIndex}-${activeSegment.endIndex}`
              : t("workspace.allPoints")}
          </strong>
        </div>
      </div>
    </Panel>
  );
}
