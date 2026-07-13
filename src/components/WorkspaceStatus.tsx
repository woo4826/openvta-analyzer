import type { ActiveSegment, SourceVisibility, TransformMode } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { Panel, SegmentedControl, ToolbarButton } from "./ui";

interface WorkspaceStatusProps {
  sourceVisibility: SourceVisibility;
  onSourceVisibility: (visibility: SourceVisibility) => void;
  rawGpsCount: number;
  enhancedGpsCount: number;
  sensorCount: number;
  transformMode: TransformMode;
  onTransformMode: (mode: TransformMode) => void;
  calibrationReady: boolean;
  filterReady: boolean;
  onOpenCalibration: () => void;
  activeSegment?: ActiveSegment;
  visiblePointCount: number;
  onActiveSegment: (segment?: ActiveSegment) => void;
  singleSourceMode?: boolean;
}

export function WorkspaceStatus({
  sourceVisibility,
  onSourceVisibility,
  rawGpsCount,
  enhancedGpsCount,
  sensorCount,
  transformMode,
  onTransformMode,
  calibrationReady,
  filterReady,
  onOpenCalibration,
  activeSegment,
  visiblePointCount,
  onActiveSegment,
  singleSourceMode = false,
}: WorkspaceStatusProps) {
  const { language, t } = useI18n();
  const numberFormat = new Intl.NumberFormat(language);
  const hasSensors = sensorCount > 0;
  const calibratedAvailable = hasSensors && calibrationReady;
  const filteredAvailable = hasSensors && filterReady;
  const transformOptions: Array<{ value: TransformMode; label: string; disabled?: boolean }> = [
    { value: "raw", label: t("workspace.transform.raw") },
    { value: "calibrated", label: t("workspace.transform.calibrated"), disabled: !calibratedAvailable },
    { value: "filtered", label: t("workspace.transform.filtered"), disabled: !filteredAvailable },
    {
      value: "compare",
      label: t("workspace.transform.compare"),
      disabled: !calibratedAvailable && !filteredAvailable,
    },
  ];

  function toggleSource(key: keyof SourceVisibility) {
    if ((key === "rawGps" ? rawGpsCount : enhancedGpsCount) === 0) {
      return;
    }
    const next = singleSourceMode
      ? { rawGps: key === "rawGps", enhancedGps: key === "enhancedGps" }
      : { ...sourceVisibility, [key]: !sourceVisibility[key] };
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
              disabled={rawGpsCount === 0}
              onClick={() => toggleSource("rawGps")}
            >
              {`${t("workspace.rawGps")} (${numberFormat.format(rawGpsCount)})`}
            </ToolbarButton>
            <ToolbarButton
              aria-pressed={sourceVisibility.enhancedGps}
              variant={sourceVisibility.enhancedGps ? "primary" : "default"}
              disabled={enhancedGpsCount === 0}
              onClick={() => toggleSource("enhancedGps")}
            >
              {`${t("workspace.enhanced")} (${numberFormat.format(enhancedGpsCount)})`}
            </ToolbarButton>
          </div>
          <small>{t("workspace.sensorRows", { count: numberFormat.format(sensorCount) })}</small>
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
          <small>{t("workspace.transformScope")}</small>
          <div className="row-actions">
            <ToolbarButton variant="ghost" onClick={onOpenCalibration}>
              {t("workspace.openCalibration")}
            </ToolbarButton>
          </div>
        </div>

        <div className="metric">
          <span>{t("workspace.segment")}</span>
          <strong>
            {activeSegment
              ? t("workspace.segmentRange", {
                  start: numberFormat.format(activeSegment.startIndex + 1),
                  end: numberFormat.format(activeSegment.endIndex + 1),
                  total: numberFormat.format(visiblePointCount),
                })
              : t("workspace.allPointsCount", { count: numberFormat.format(visiblePointCount) })}
          </strong>
          {activeSegment ? (
            <div className="row-actions">
              <ToolbarButton variant="ghost" onClick={() => onActiveSegment(undefined)}>
                {t("workspace.resetSegment")}
              </ToolbarButton>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
