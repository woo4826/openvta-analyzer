import { useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AnalysisScope, TrackSection } from "../domain/types";
import type { SegmentFilter } from "../app/useSegmentWorkbench";
import { useI18n } from "../i18n/useI18n";
import { snapRangeToBoundaries } from "./segmentRange";

interface SegmentScopeNavigatorProps {
  scope: AnalysisScope;
  filter: SegmentFilter;
  sections: TrackSection[];
  totalDistanceMeters: number;
  snapToSections: boolean;
  onFilter: (filter: SegmentFilter) => void;
  onWholeLap: () => void;
  onSection: (sectionId: string) => void;
  onRange: (startDistanceMeters: number, endDistanceMeters: number) => void;
}

interface DraftRange {
  scopeSignature: string;
  values: [number, number];
}

const CUSTOM_RANGE_VALUE = "__custom-range__";

export function SegmentScopeNavigator({
  scope,
  filter,
  sections,
  totalDistanceMeters,
  snapToSections,
  onFilter,
  onWholeLap,
  onSection,
  onRange,
}: SegmentScopeNavigatorProps) {
  const { t } = useI18n();
  const max = Math.max(1, Math.round(totalDistanceMeters));
  const selected = scope.kind === "section"
    ? sections.find((section) => section.id === scope.sectionId)
    : undefined;
  const filteredSections = useMemo(() => sections.filter((section) => {
    if (filter === "corners") return section.kind !== "straight";
    if (filter === "straights") return section.kind === "straight";
    return true;
  }), [filter, sections]);
  const committedRange = scopeRange(scope, selected, max);
  const scopeSignature = `${scope.kind}:${scope.kind === "section" ? scope.sectionId : scope.kind === "range" ? `${scope.startDistanceMeters}:${scope.endDistanceMeters}` : "whole"}:${committedRange[0]}:${committedRange[1]}:${max}`;
  const [draft, setDraft] = useState<DraftRange>();
  const values = draft?.scopeSignature === scopeSignature ? draft.values : committedRange;
  const activeName = selected?.name
    ?? (scope.kind === "range" ? t("lap.workbench.customRange") : t("lap.workbench.wholeLap"));
  const selectedIndex = selected
    ? filteredSections.findIndex((section) => section.id === selected.id)
    : -1;

  const selectWholeLap = () => {
    setDraft(undefined);
    onWholeLap();
  };
  const selectSection = (sectionId: string) => {
    setDraft(undefined);
    onSection(sectionId);
  };
  const commitRange = (nextValues: number[]) => {
    const normalized: [number, number] = [
      Math.min(nextValues[0] ?? 0, nextValues[1] ?? max),
      Math.max(nextValues[0] ?? 0, nextValues[1] ?? max),
    ];
    const committed = snapToSections
      ? snapRangeToBoundaries(normalized, sections, max)
      : normalized;
    setDraft({ scopeSignature, values: committed });
    if (committed[0] <= 0 && committed[1] >= max) selectWholeLap();
    else onRange(committed[0], committed[1]);
  };

  return (
    <nav className="segment-scope-navigator" aria-label={t("lap.workbench.scope")}>
      <div className="segment-scope-navigator-header">
        <div className="segment-scope-summary" aria-live="polite">
          <span className="panel-eyebrow">{t("lap.workbench.scope")}</span>
          <strong>{activeName}</strong>
          <span>{formatRange(values)}</span>
        </div>

        <div className="segmented-control segment-filter" role="group" aria-label={t("lap.workbench.sectionFilter")}>
          {([
            ["all", t("lap.workbench.all")],
            ["corners", t("lap.workbench.corners")],
            ["straights", t("lap.workbench.straights")],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => onFilter(id)}>{label}</button>
          ))}
        </div>

        <label className="segment-scope-select">
          <span>{t("lap.workbench.sectionChooser")}</span>
          <select
            aria-label={t("lap.workbench.sectionChooser")}
            disabled={filteredSections.length === 0}
            value={scope.kind === "range" ? CUSTOM_RANGE_VALUE : selected?.id ?? ""}
            onChange={(event) => {
              if (event.target.value === "") selectWholeLap();
              else if (event.target.value !== CUSTOM_RANGE_VALUE) selectSection(event.target.value);
            }}
          >
            <option value="">{t("lap.workbench.wholeLap")}</option>
            {scope.kind === "range" ? <option value={CUSTOM_RANGE_VALUE}>{t("lap.workbench.customRange")}</option> : null}
            {filteredSections.map((section) => (
              <option value={section.id} key={section.id}>
                {section.name} · {Math.round(clampedSectionLength(section, max))} m
              </option>
            ))}
          </select>
        </label>

        <div className="segment-scope-navigation">
          <button
            type="button"
            className="icon-button button ghost"
            aria-label={t("lap.workbench.previousSection")}
            disabled={selectedIndex <= 0}
            onClick={() => selectSection(filteredSections[selectedIndex - 1].id)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="icon-button button ghost"
            aria-label={t("lap.workbench.nextSection")}
            disabled={filteredSections.length === 0 || selectedIndex >= filteredSections.length - 1}
            onClick={() => selectSection(filteredSections[selectedIndex < 0 ? 0 : selectedIndex + 1].id)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
          <button type="button" className="button ghost" aria-pressed={scope.kind === "whole-lap"} onClick={selectWholeLap}>
            {t("lap.workbench.wholeLap")}
          </button>
        </div>
      </div>

      <div className="segment-scope-track" aria-label={t("lap.workbench.trackSections")}>
        {sections.map((section) => {
          const start = clamp(section.startDistanceMeters, 0, max);
          const end = clamp(section.endDistanceMeters, start, max);
          const left = start / max * 100;
          const width = (end - start) / max * 100;
          const compatible = filteredSections.some((candidate) => candidate.id === section.id);
          return (
            <button
              type="button"
              key={section.id}
              data-section-id={section.id}
              className={`segment-proportion-section ${section.kind}${compatible ? "" : " is-filtered"}`}
              style={{ left: `${left}%`, width: `${Math.max(0.08, width)}%` }}
              aria-label={`${section.name} · ${Math.round(start)}–${Math.round(end)} m`}
              aria-pressed={scope.kind === "section" && scope.sectionId === section.id}
              aria-current={scope.kind === "section" && scope.sectionId === section.id ? "true" : undefined}
              disabled={!compatible}
              onClick={() => selectSection(section.id)}
            >
              {width >= 3 ? compactSectionLabel(section) : null}
            </button>
          );
        })}
      </div>

      <Slider.Root
        className="segment-range-slider"
        min={0}
        max={max}
        step={1}
        minStepsBetweenThumbs={5}
        value={values}
        onValueChange={(nextValues) => setDraft({
          scopeSignature,
          values: [nextValues[0] ?? 0, nextValues[1] ?? max],
        })}
        onValueCommit={commitRange}
      >
        <Slider.Track className="segment-range-slider-track">
          <Slider.Range className="segment-range-slider-selection" />
        </Slider.Track>
        <Slider.Thumb className="segment-range-slider-thumb" aria-label={t("lap.workbench.rangeStartThumb")} />
        <Slider.Thumb className="segment-range-slider-thumb" aria-label={t("lap.workbench.rangeEndThumb")} />
      </Slider.Root>

      <div className="segment-scope-footer">
        <div className="segment-range-scale" aria-hidden>
          <span>0 m</span>
          <span>{Math.round(max / 2)} m</span>
          <span>{max} m</span>
        </div>
        <p className="segment-range-help">
          {snapToSections ? t("lap.workbench.rangeSnapOn") : t("lap.workbench.rangeSnapOff")}
        </p>
      </div>
    </nav>
  );
}

function scopeRange(scope: AnalysisScope, selected: TrackSection | undefined, max: number): [number, number] {
  if (scope.kind === "range") {
    return orderedRange(scope.startDistanceMeters, scope.endDistanceMeters, max);
  }
  if (selected) return orderedRange(selected.startDistanceMeters, selected.endDistanceMeters, max);
  return [0, max];
}

function orderedRange(left: number, right: number, max: number): [number, number] {
  const start = clamp(Math.min(left, right), 0, max);
  const end = clamp(Math.max(left, right), start, max);
  return [start, end];
}

function clampedSectionLength(section: TrackSection, max: number): number {
  const [start, end] = orderedRange(section.startDistanceMeters, section.endDistanceMeters, max);
  return end - start;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function formatRange(range: [number, number]): string {
  return `${Math.round(range[0])}–${Math.round(range[1])} m`;
}

function compactSectionLabel(section: TrackSection): string {
  const number = section.name.match(/\d+/)?.[0];
  if (number) return `${section.kind === "straight" ? "S" : "C"}${number}`;
  return section.name.slice(0, 3);
}
