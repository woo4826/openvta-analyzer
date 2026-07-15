import type { LapOpportunity } from "../domain/opportunityAnalysis";
import type { TrackSection } from "../domain/types";
import type { TrackSectionVisual } from "./RouteMap";

export function buildSectionVisuals(
  sections: TrackSection[],
  opportunities: LapOpportunity[],
  selectedSectionId?: string,
): Record<string, TrackSectionVisual> {
  const visuals: Record<string, TrackSectionVisual> = Object.fromEntries(sections.map((section) => [
    section.id,
    { color: "#87969f", width: 5, opacity: 0.5 },
  ]));
  const colors = { high: "#be3b3b", medium: "#d97706", low: "#2b6cb0" };
  for (const opportunity of opportunities) {
    visuals[opportunity.sectionId] = {
      color: colors[opportunity.severity],
      width: opportunity.sectionId === selectedSectionId ? 12 : 9,
      opacity: 0.96,
    };
  }
  if (selectedSectionId && visuals[selectedSectionId]) {
    visuals[selectedSectionId] = { ...visuals[selectedSectionId], color: "#7c3aed", width: 12, opacity: 1 };
  }
  return visuals;
}
