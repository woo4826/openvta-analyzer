import { useEffect, useRef } from "react";
import type { AnalysisScope, TrackSection } from "../domain/types";
import type { SegmentFilter } from "../app/useSegmentWorkbench";
import { useI18n } from "../i18n/useI18n";

interface SegmentScopeRibbonProps {
  scope: AnalysisScope;
  filter: SegmentFilter;
  sections: TrackSection[];
  losses?: Record<string, number>;
  onWholeLap: () => void;
  onFilter: (filter: SegmentFilter) => void;
  onSection: (sectionId: string) => void;
}

export function SegmentScopeRibbon({
  scope,
  filter,
  sections,
  losses = {},
  onWholeLap,
  onFilter,
  onSection,
}: SegmentScopeRibbonProps) {
  const { t } = useI18n();
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scope.kind !== "section") return;
    const selected = chipRefs.current.get(scope.sectionId);
    const scroller = scrollRef.current;
    if (!selected || !scroller) return;
    const centerSelected = () => {
      const chipRect = selected.getBoundingClientRect();
      const scrollRect = scroller.getBoundingClientRect();
      if (chipRect.left < scrollRect.left || chipRect.right > scrollRect.right) {
        selected.scrollIntoView?.({ block: "nearest", inline: "center" });
      }
    };
    selected.scrollIntoView?.({ block: "nearest", inline: "center" });
    window.addEventListener("resize", centerSelected);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", centerSelected);
    }
    const observer = new ResizeObserver(centerSelected);
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", centerSelected);
    };
  }, [scope, sections]);

  const moveSectionFocus = (sectionId: string, direction: -1 | 1) => {
    const current = sections.findIndex((section) => section.id === sectionId);
    const next = sections[current + direction];
    if (!next) return;
    onSection(next.id);
    chipRefs.current.get(next.id)?.focus();
  };
  return (
    <nav className="segment-scope-ribbon" aria-label={t("lap.workbench.scope")}>
      <div className="segmented-control segment-filter" role="group" aria-label={t("lap.workbench.sectionFilter")}>
        {([
          ["all", t("lap.workbench.all")],
          ["corners", t("lap.workbench.corners")],
          ["straights", t("lap.workbench.straights")],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => onFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="segment-scope-scroll" ref={scrollRef}>
        <button
          type="button"
          className="segment-scope-chip whole-lap"
          aria-pressed={scope.kind === "whole-lap"}
          onClick={onWholeLap}
        >
          {t("lap.workbench.wholeLap")}
        </button>
        {sections.map((section) => (
          <button
            type="button"
            className={`segment-scope-chip ${section.kind}`}
            key={section.id}
            aria-pressed={scope.kind === "section" && scope.sectionId === section.id}
            aria-current={scope.kind === "section" && scope.sectionId === section.id ? "true" : undefined}
            ref={(element) => {
              if (element) chipRefs.current.set(section.id, element);
              else chipRefs.current.delete(section.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              moveSectionFocus(section.id, event.key === "ArrowLeft" ? -1 : 1);
            }}
            onClick={() => onSection(section.id)}
          >
            <strong>{section.name}</strong>
            <span>
              {Math.round(section.endDistanceMeters - section.startDistanceMeters)} m
              {losses[section.id] > 0.001 ? ` · +${losses[section.id].toFixed(3)} s` : ""}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
