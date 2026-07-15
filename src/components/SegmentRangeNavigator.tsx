import { useEffect, useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import type { AnalysisScope, TrackSection } from "../domain/types";
import { useI18n } from "../i18n/useI18n";
import { snapRangeToBoundaries } from "./segmentRange";

interface SegmentRangeNavigatorProps {
  scope: AnalysisScope;
  sections: TrackSection[];
  totalDistanceMeters: number;
  snapToSections: boolean;
  onWholeLap: () => void;
  onRange: (startDistanceMeters: number, endDistanceMeters: number) => void;
}

export function SegmentRangeNavigator({
  scope,
  sections,
  totalDistanceMeters,
  snapToSections,
  onWholeLap,
  onRange,
}: SegmentRangeNavigatorProps) {
  const { t } = useI18n();
  const max = Math.max(1, Math.round(totalDistanceMeters));
  const selected = scope.kind === "section" ? sections.find((section) => section.id === scope.sectionId) : undefined;
  const scopeRange = useMemo<[number, number]>(() => {
    if (scope.kind === "range") return [clamp(scope.startDistanceMeters, 0, max), clamp(scope.endDistanceMeters, 0, max)];
    if (selected) return [clamp(selected.startDistanceMeters, 0, max), clamp(selected.endDistanceMeters, 0, max)];
    return [0, max];
  }, [max, scope, selected]);
  const [draftRange, setDraftRange] = useState(scopeRange);
  useEffect(() => setDraftRange(scopeRange), [scopeRange]);

  const commitRange = (values: number[]) => {
    const normalized: [number, number] = [Math.min(values[0] ?? 0, values[1] ?? max), Math.max(values[0] ?? 0, values[1] ?? max)];
    const committed = snapToSections
      ? snapRangeToBoundaries(normalized, sections, max)
      : normalized;
    setDraftRange(committed);
    if (committed[0] <= 0 && committed[1] >= max) onWholeLap();
    else onRange(committed[0], committed[1]);
  };

  return (
    <section className="segment-range-navigator" aria-label={t("lap.workbench.rangeNavigator")}>
      <div className="segment-range-navigator-header">
        <div>
          <span className="panel-eyebrow">{t("lap.workbench.scope")}</span>
          <strong>{selected?.name ?? (scope.kind === "range" ? t("lap.workbench.customRange") : t("lap.workbench.wholeLap"))}</strong>
          <small>{Math.round(draftRange[0])}–{Math.round(draftRange[1])} m</small>
        </div>
        <button type="button" className="button ghost" aria-pressed={scope.kind === "whole-lap"} onClick={onWholeLap}>
          {t("lap.workbench.wholeLap")}
        </button>
      </div>

      <div className="segment-proportion-strip" aria-hidden="true">
        {sections.map((section) => {
          const left = clamp(section.startDistanceMeters / max * 100, 0, 100);
          const width = clamp((section.endDistanceMeters - section.startDistanceMeters) / max * 100, 0.35, 100 - left);
          return (
            <span
              key={section.id}
              className={`segment-proportion-section ${section.kind}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${section.name} · ${Math.round(section.endDistanceMeters - section.startDistanceMeters)} m`}
            >
              {width >= 3 ? <span>{compactSectionLabel(section)}</span> : null}
            </span>
          );
        })}
      </div>

      <Slider.Root
        className="segment-range-slider"
        min={0}
        max={max}
        step={1}
        minStepsBetweenThumbs={5}
        value={draftRange}
        onValueChange={(values) => setDraftRange([values[0] ?? 0, values[1] ?? max])}
        onValueCommit={commitRange}
      >
        <Slider.Track className="segment-range-slider-track">
          <Slider.Range className="segment-range-slider-selection" />
        </Slider.Track>
        <Slider.Thumb className="segment-range-slider-thumb" aria-label={t("lap.workbench.rangeStartThumb")} />
        <Slider.Thumb className="segment-range-slider-thumb" aria-label={t("lap.workbench.rangeEndThumb")} />
      </Slider.Root>

      <div className="segment-range-scale" aria-hidden>
        <span>0 m</span>
        <span>{Math.round(max / 2)} m</span>
        <span>{max} m</span>
      </div>
      <p className="segment-range-help">
        {snapToSections ? t("lap.workbench.rangeSnapOn") : t("lap.workbench.rangeSnapOff")}
      </p>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function compactSectionLabel(section: TrackSection): string {
  const number = section.name.match(/\d+/)?.[0];
  if (number) return `${section.kind === "straight" ? "S" : "C"}${number}`;
  return section.name.slice(0, 3);
}
