import { useEffect } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type {
  AnalysisScope,
  SegmentLapVisibility,
  SegmentWidgetId,
  TrackSection,
} from "../domain/types";
import { SEGMENT_WIDGET_IDS, canHideWidget } from "../domain/segmentWorkbenchPreferences";
import type { SegmentAxis } from "../app/useSegmentWorkbench";
import { useI18n } from "../i18n/useI18n";
import { SegmentRangeNavigator } from "./SegmentRangeNavigator";
import { useContainedPanelFocus } from "./useContainedPanelFocus";

interface SegmentWorkbenchControlsProps {
  open: boolean;
  scope: AnalysisScope;
  sections: TrackSection[];
  totalDistanceMeters: number;
  lapVisibility: SegmentLapVisibility;
  axis: SegmentAxis;
  includePartialLapSections: boolean;
  partialImpact: string;
  snapToSections: boolean;
  visibleWidgets: Record<SegmentWidgetId, boolean>;
  onOpenChange: (open: boolean) => void;
  onLapVisibility: (mode: SegmentLapVisibility) => void;
  onAxis: (axis: SegmentAxis) => void;
  onIncludePartialLapSections: (include: boolean) => void;
  onSnapToSections: (snap: boolean) => void;
  onWholeLap: () => void;
  onRange: (startDistanceMeters: number, endDistanceMeters: number) => void;
  onWidgetVisibility: (widgetId: SegmentWidgetId, visible: boolean) => void;
  onResetLayout: () => void;
}

export function SegmentWorkbenchControls({
  open,
  scope,
  sections,
  totalDistanceMeters,
  lapVisibility,
  axis,
  includePartialLapSections,
  partialImpact,
  snapToSections,
  visibleWidgets,
  onOpenChange,
  onLapVisibility,
  onAxis,
  onIncludePartialLapSections,
  onSnapToSections,
  onWholeLap,
  onRange,
  onWidgetVisibility,
  onResetLayout,
}: SegmentWorkbenchControlsProps) {
  const { t } = useI18n();
  const { panelRef, triggerRef } = useContainedPanelFocus(open, () => onOpenChange(false));

  useEffect(() => {
    document.documentElement.classList.toggle("lap-analysis-controls-open", open);
    return () => document.documentElement.classList.remove("lap-analysis-controls-open");
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`button primary segment-controls-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls="segment-workbench-controls"
        onClick={() => onOpenChange(!open)}
      >
        <SlidersHorizontal size={17} aria-hidden />
        {t("lap.workbench.analysisControls")}
      </button>
      {open ? createPortal(<>
        <button type="button" className="segment-controls-scrim" aria-label={t("lap.workbench.closeControls")} onClick={() => onOpenChange(false)} />
        <aside
          ref={panelRef}
          id="segment-workbench-controls"
          className="segment-controls-drawer is-open"
          role="dialog"
          aria-modal="true"
          aria-label={t("lap.workbench.analysisControls")}
        >
        <header className="segment-controls-header">
          <div>
            <span className="panel-eyebrow">{t("lap.workbench.controlsEyebrow")}</span>
            <h2>{t("lap.workbench.analysisControls")}</h2>
          </div>
          <button type="button" className="icon-button button ghost" aria-label={t("lap.workbench.closeControls")} onClick={() => onOpenChange(false)}>
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="segment-controls-body">
          <fieldset className="segment-control-group">
            <legend>{t("lap.workbench.comparison")}</legend>
            <label className="field">
              <span>{t("lap.workbench.visibleLaps")}</span>
              <select aria-label={t("lap.workbench.visibleLaps")} value={lapVisibility} onChange={(event) => onLapVisibility(event.target.value as SegmentLapVisibility)}>
                <option value="all">{t("lap.workbench.visibleAll")}</option>
                <option value="focus-reference">{t("lap.workbench.visibleFocusReference")}</option>
                <option value="focus-only">{t("lap.workbench.visibleFocusOnly")}</option>
              </select>
              <small>{lapVisibility === "focus-only" ? t("lap.workbench.referenceStillCalculates") : t("lap.workbench.visibleLapsHelp")}</small>
            </label>
          </fieldset>

          <SegmentRangeNavigator
            scope={scope}
            sections={sections}
            totalDistanceMeters={totalDistanceMeters}
            snapToSections={snapToSections}
            onWholeLap={onWholeLap}
            onRange={onRange}
          />

          <fieldset className="segment-control-group">
            <legend>{t("lap.workbench.chartSettings")}</legend>
            <div className="segmented-control" role="group" aria-label={t("lap.workbench.graphAxis")}>
              <button type="button" aria-pressed={axis === "distance"} onClick={() => onAxis("distance")}>{t("lap.workbench.distanceAxis")}</button>
              <button type="button" aria-pressed={axis === "time"} onClick={() => onAxis("time")}>{t("lap.workbench.timeAxis")}</button>
            </div>
            <label className="lap-option-check">
              <input type="checkbox" checked={snapToSections} onChange={(event) => onSnapToSections(event.target.checked)} />
              <span>{t("lap.workbench.snapToSections")}</span>
            </label>
            <label className="lap-option-check">
              <input type="checkbox" checked={includePartialLapSections} onChange={(event) => onIncludePartialLapSections(event.target.checked)} />
              <span>{t("lap.workbench.includePartial")}</span>
            </label>
            <p className="partial-policy-impact" aria-live="polite">{partialImpact}</p>
          </fieldset>

          <fieldset className="segment-control-group">
            <legend>{t("lap.workbench.widgets")}</legend>
            <div className="segment-widget-switches">
              {SEGMENT_WIDGET_IDS.map((widgetId) => (
                <label className="lap-option-check" key={widgetId}>
                  <input
                    type="checkbox"
                    checked={visibleWidgets[widgetId]}
                    disabled={visibleWidgets[widgetId] && !canHideWidget(visibleWidgets, widgetId)}
                    onChange={(event) => onWidgetVisibility(widgetId, event.target.checked)}
                  />
                  <span>{t(widgetLabelKey(widgetId))}</span>
                </label>
              ))}
            </div>
            <button type="button" className="button" onClick={onResetLayout}>
              <RotateCcw size={16} aria-hidden />{t("lap.workbench.resetLayout")}
            </button>
          </fieldset>
        </div>
        </aside>
      </>, document.body) : null}
    </>
  );
}

function widgetLabelKey(widgetId: SegmentWidgetId) {
  return `lap.workbench.widget.${widgetId}` as const;
}
