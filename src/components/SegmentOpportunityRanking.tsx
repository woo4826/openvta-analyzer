import type { AnalysisScope, SectionOpportunity } from "../domain/types";
import { useI18n } from "../i18n/useI18n";

interface SegmentOpportunityRankingProps {
  opportunities: SectionOpportunity[];
  scope: AnalysisScope;
  focusedLapOrdinal?: number;
  referenceLapOrdinal?: number;
  onSection: (sectionId: string) => void;
}

const MAX_VISIBLE_OPPORTUNITIES = 6;

export function SegmentOpportunityRanking({
  opportunities,
  scope,
  focusedLapOrdinal,
  referenceLapOrdinal,
  onSection,
}: SegmentOpportunityRankingProps) {
  const { t } = useI18n();
  const losses = [...opportunities]
    .filter((opportunity) => opportunity.timeDeltaSeconds > 0.001)
    .sort((left, right) => right.timeDeltaSeconds - left.timeDeltaSeconds);
  const visible = losses.slice(0, MAX_VISIBLE_OPPORTUNITIES);
  const maximumLoss = visible[0]?.timeDeltaSeconds ?? 0;
  const potential = losses.reduce((sum, opportunity) => sum + opportunity.timeDeltaSeconds, 0);

  return (
    <section className="panel segment-opportunity-ranking" aria-label={t("lap.workbench.opportunityRanking")}>
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">{t("lap.workbench.coachPriority")}</span>
          <h3>{t("lap.workbench.opportunityRanking")}</h3>
          <p>{t("lap.workbench.focusVsReference", {
            focus: focusedLapOrdinal ?? "—",
            reference: referenceLapOrdinal ?? "—",
          })}</p>
        </div>
        <span className="segment-potential-total">
          <small>{t("lap.workbench.identifiedLoss")}</small>
          <strong>{potential > 0 ? `+${potential.toFixed(3)} s` : "—"}</strong>
        </span>
      </div>
      <div className="panel-body">
        {visible.length ? (
          <ol className="segment-opportunity-list">
            {visible.map((opportunity, index) => {
              const selected = scope.kind === "section" && scope.sectionId === opportunity.section.id;
              return (
                <li key={opportunity.section.id}>
                  <button
                    type="button"
                    className="segment-opportunity-row"
                    aria-pressed={selected}
                    onClick={() => onSection(opportunity.section.id)}
                  >
                    <span className="segment-opportunity-rank">{index + 1}</span>
                    <span className="segment-opportunity-copy">
                      <span className="segment-opportunity-name">
                        <strong>{opportunity.section.name}</strong>
                        <span>{opportunity.section.kind === "straight" ? t("lap.straight") : t("lap.section")}</span>
                      </span>
                      <span className="segment-opportunity-bar" aria-hidden>
                        <span style={{ width: `${Math.max(6, opportunity.timeDeltaSeconds / maximumLoss * 100)}%` }} />
                      </span>
                      <span className="segment-opportunity-meta">
                        {metric(t("lap.workbench.exitDelta"), opportunity.exitSpeedDeltaKmh, "km/h")}
                        {metric(t("lap.workbench.pathDelta"), opportunity.pathDeltaMeters, "m")}
                        {opportunity.consistencyStdDevSeconds === undefined
                          ? null
                          : <span>{t("lap.workbench.consistencySigma")} {opportunity.consistencyStdDevSeconds.toFixed(3)} s</span>}
                      </span>
                    </span>
                    <strong className="segment-opportunity-loss">+{opportunity.timeDeltaSeconds.toFixed(3)} s</strong>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : <p className="empty-state compact">{t("lap.workbench.noReferenceLoss")}</p>}
      </div>
    </section>
  );
}

function metric(label: string, value: number | undefined, unit: string) {
  if (value === undefined) return null;
  return <span>{label} {value > 0 ? "+" : ""}{value.toFixed(1)} {unit}</span>;
}
