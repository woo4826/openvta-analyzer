import { useEffect } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type {
  AnalysisScope,
  SegmentLapVisibility,
  SegmentWidgetId,
  TrackSection,
} from "../domain/types";
import { SEGMENT_WIDGET_IDS, canHideWidget } from "../domain/segmentWorkbenchPreferences";
import type { SegmentAxis, SegmentFilter } from "../app/useSegmentWorkbench";
import { useI18n } from "../i18n/useI18n";
import { SegmentRangeNavigator } from "./SegmentRangeNavigator";

export interface LapControlOption {
  id: string;
  label: string;
}

interface SegmentWorkbenchControlsProps {
  open: boolean;
  scope: AnalysisScope;
  filter: SegmentFilter;
  sections: TrackSection[];
  totalDistanceMeters: number;
  focusedLapId?: string;
  referenceLapId?: string;
  focusOptions: LapControlOption[];
  referenceOptions: LapControlOption[];
  lapVisibility: SegmentLapVisibility;
  axis: SegmentAxis;
  includePartialLapSections: boolean;
  partialImpact: string;
  snapToSections: boolean;
  visibleWidgets: Record<SegmentWidgetId, boolean>;
  onOpenChange: (open: boolean) => void;
  onFocusedLap: (lapId: string) => void;
  onReferenceLap: (lapId: string) => void;
  onLapVisibility: (mode: SegmentLapVisibility) => void;
  onAxis: (axis: SegmentAxis) => void;
  onIncludePartialLapSections: (include: boolean) => void;
  onSnapToSections: (snap: boolean) => void;
  onWholeLap: () => void;
  onFilter: (filter: SegmentFilter) => void;
  onSection: (sectionId: string) => void;
  onRange: (startDistanceMeters: number, endDistanceMeters: number) => void;
  onWidgetVisibility: (widgetId: SegmentWidgetId, visible: boolean) => void;
  onResetLayout: () => void;
}

export function SegmentWorkbenchControls({
  open,
  scope,
  filter,
  sections,
  totalDistanceMeters,
  focusedLapId,
  referenceLapId,
  focusOptions,
  referenceOptions,
  lapVisibility,
  axis,
  includePartialLapSections,
  partialImpact,
  snapToSections,
  visibleWidgets,
  onOpenChange,
  onFocusedLap,
  onReferenceLap,
  onLapVisibility,
  onAxis,
  onIncludePartialLapSections,
  onSnapToSections,
  onWholeLap,
  onFilter,
  onSection,
  onRange,
  onWidgetVisibility,
  onResetLayout,
}: SegmentWorkbenchControlsProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  return (
    <>
      <button
        type="button"
        className={`button primary segment-controls-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls="segment-workbench-controls"
        onClick={() => onOpenChange(!open)}
      >
        <SlidersHorizontal size={17} aria-hidden />
        {t("lap.workbench.analysisControls")}
      </button>
      {open ? <button type="button" className="segment-controls-scrim" aria-label={t("lap.workbench.closeControls")} onClick={() => onOpenChange(false)} /> : null}
      {open ? <aside
        id="segment-workbench-controls"
        className="segment-controls-drawer is-open"
        role="dialog"
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
              <span>{t("lap.workbench.focusedLap")}</span>
              <select aria-label={t("lap.workbench.focusedLap")} value={focusedLapId ?? ""} onChange={(event) => onFocusedLap(event.target.value)}>
                {focusOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t("lap.workbench.referenceLap")}</span>
              <select aria-label={t("lap.workbench.referenceLap")} value={referenceLapId ?? ""} onChange={(event) => onReferenceLap(event.target.value)}>
                {referenceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
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
            filter={filter}
            sections={sections}
            totalDistanceMeters={totalDistanceMeters}
            snapToSections={snapToSections}
            onWholeLap={onWholeLap}
            onFilter={onFilter}
            onSection={onSection}
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
      </aside> : null}
    </>
  );
}

function widgetLabelKey(widgetId: SegmentWidgetId) {
  return `lap.workbench.widget.${widgetId}` as const;
}
