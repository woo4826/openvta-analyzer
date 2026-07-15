import type { AnalysisScope, TrackSection } from "../domain/types";
import type { SegmentFilter } from "../app/useSegmentWorkbench";
import { useI18n } from "../i18n/useI18n";

interface SegmentScopeRibbonProps {
  scope: AnalysisScope;
  filter: SegmentFilter;
  sections: TrackSection[];
  onWholeLap: () => void;
  onFilter: (filter: SegmentFilter) => void;
  onSection: (sectionId: string) => void;
}

export function SegmentScopeRibbon({
  scope,
  filter,
  sections,
  onWholeLap,
  onFilter,
  onSection,
}: SegmentScopeRibbonProps) {
  const { t } = useI18n();
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
      <div className="segment-scope-scroll">
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
            onClick={() => onSection(section.id)}
          >
            <strong>{section.name}</strong>
            <span>{Math.round(section.endDistanceMeters - section.startDistanceMeters)} m</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
