import { useMemo } from "react";
import type { LineString } from "geojson";
import { AlertTriangle, Gauge, Target } from "lucide-react";
import { analyzeLapOpportunities, type LapOpportunity, type OpportunityCause } from "../domain/opportunityAnalysis";
import type {
  ActiveSegment,
  GpsPoint,
  LapResult,
  LapSectionResult,
  MapSettings,
  SourceVisibility,
  TrackGate,
  TrackSection,
} from "../domain/types";
import type { Translate } from "../i18n/messages";
import type { TranslationKey } from "../i18n/locales";
import { useI18n } from "../i18n/useI18n";
import { RouteMap } from "./RouteMap";
import { buildSectionVisuals } from "./opportunityVisuals";
import { Metric, Panel } from "./ui";

interface LapOpportunityOverviewProps {
  points: GpsPoint[];
  laps: LapResult[];
  primaryLapId?: string;
  onPrimaryLap: (lapId: string) => void;
  fastestSeconds?: number;
  theoreticalBestSeconds?: number;
  sections: TrackSection[];
  sectionResults: LapSectionResult[];
  selectedSectionId?: string;
  onSelectSection: (sectionId: string) => void;
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  sourceVisibility: SourceVisibility;
  mapSettings: MapSettings;
  onMapSettingsChange: (settings: MapSettings) => void;
  activeSegment?: ActiveSegment;
  onActiveSegment: (segment?: ActiveSegment) => void;
  trackCenterline?: LineString;
  sectionCenterline?: LineString;
  gates?: TrackGate[];
  trackName?: string;
}

export function LapOpportunityOverview({
  points,
  laps,
  primaryLapId,
  onPrimaryLap,
  fastestSeconds,
  theoreticalBestSeconds,
  sections,
  sectionResults,
  selectedSectionId,
  onSelectSection,
  selectedPointIndex,
  onSelectedPointIndex,
  sourceVisibility,
  mapSettings,
  onMapSettingsChange,
  activeSegment,
  onActiveSegment,
  trackCenterline,
  sectionCenterline,
  gates = [],
  trackName,
}: LapOpportunityOverviewProps) {
  const { t } = useI18n();
  const summary = useMemo(
    () => analyzeLapOpportunities(primaryLapId, sections, sectionResults, 3),
    [primaryLapId, sectionResults, sections],
  );
  const effectiveSectionId = selectedSectionId ?? summary.opportunities[0]?.sectionId;
  const sectionVisuals = useMemo(
    () => buildSectionVisuals(sections, summary.opportunities, effectiveSectionId),
    [effectiveSectionId, sections, summary.opportunities],
  );
  const completeCount = laps.filter((lap) => lap.completion === "complete").length;
  const partialCount = laps.length - completeCount;

  return (
    <section className="lap-opportunity-overview lap-wide-panel" aria-label={t("lap.insights.title")}>
      <Panel
        title={t("lap.insights.title")}
        eyebrow={trackName ? `${t("lap.insights.eyebrow")} · ${trackName}` : t("lap.insights.eyebrow")}
        className="lap-performance-header"
        actions={(
          <label className="field lap-primary-selector">
            <span>{t("lap.insights.selectedLap")}</span>
            <select value={primaryLapId ?? ""} onChange={(event) => onPrimaryLap(event.target.value)}>
              {laps.map((lap) => <option key={lap.id} value={lap.id}>{lapName(lap, t)}</option>)}
            </select>
          </label>
        )}
        bodyClassName="metric-grid lap-opportunity-metrics"
      >
        <Metric label={t("lap.insights.fastest")} value={formatLapTime(fastestSeconds)} tone="success" />
        <Metric label={t("lap.insights.optimal")} value={formatLapTime(theoreticalBestSeconds)} tone="info" />
        <Metric
          label={t("lap.insights.potential")}
          value={summary.potentialGainSeconds > 0 ? `-${summary.potentialGainSeconds.toFixed(3)} s` : "—"}
          detail={`${summary.analyzedSectionCount}/${sections.length}`}
          tone={summary.potentialGainSeconds > 0 ? "warning" : "neutral"}
        />
        <Metric label={t("lap.insights.lapCount")} value={`${completeCount} / ${partialCount}`} />
      </Panel>

      <div className="lap-opportunity-stage">
        <Panel title={t("lap.insights.mapTitle")} eyebrow={t("lap.insights.mapEyebrow")} className="lap-opportunity-map-panel">
          <RouteMap
            points={points}
            selectedIndex={selectedPointIndex}
            sourceVisibility={sourceVisibility}
            settings={mapSettings}
            segment={activeSegment}
            trackCenterline={trackCenterline}
            sectionCenterline={sectionCenterline}
            trackSections={sections}
            sectionVisuals={sectionVisuals}
            showRoutePoints={false}
            gates={gates}
            onSectionSelect={onSelectSection}
            onSelectedIndex={onSelectedPointIndex}
            onSegmentChange={onActiveSegment}
            onRegionChange={() => undefined}
            onSettingsChange={onMapSettingsChange}
          />
        </Panel>

        <Panel
          title={t("lap.insights.opportunitiesTitle")}
          eyebrow={t("lap.insights.opportunitiesEyebrow")}
          className="lap-opportunity-list-panel"
        >
          {summary.opportunities.length ? (
            <div className="lap-opportunity-list">
              {summary.opportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.sectionId}
                  opportunity={opportunity}
                  selected={effectiveSectionId === opportunity.sectionId}
                  onSelect={() => onSelectSection(opportunity.sectionId)}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state compact lap-opportunity-empty">
              <Target size={22} aria-hidden />
              <p>{t("lap.insights.noOpportunity")}</p>
            </div>
          )}
          <p className="lap-gps-evidence"><AlertTriangle size={14} aria-hidden />{t("lap.insights.gpsEvidence")}</p>
        </Panel>
      </div>
    </section>
  );
}

function OpportunityCard({
  opportunity,
  selected,
  onSelect,
  t,
}: {
  opportunity: LapOpportunity;
  selected: boolean;
  onSelect: () => void;
  t: Translate;
}) {
  const cause = causeLabel(opportunity.cause, t);
  return (
    <button
      type="button"
      className={`lap-opportunity-card opportunity-${opportunity.severity}${selected ? " selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${opportunity.name} ${opportunity.lostSeconds.toFixed(3)} s · ${cause}`}
      onClick={onSelect}
    >
      <span className="lap-opportunity-rank">{opportunity.rank}</span>
      <span className="lap-opportunity-copy">
        <strong>{opportunity.name}</strong>
        <span>{cause}</span>
        <small>{t("lap.insights.share", { percent: Math.round(opportunity.share * 100) })}</small>
      </span>
      <span className="lap-opportunity-loss">
        <Gauge size={15} aria-hidden />
        <strong>+{opportunity.lostSeconds.toFixed(3)} s</strong>
        {opportunity.speedDeficitKmh >= 2 ? <small>-{opportunity.speedDeficitKmh.toFixed(1)} km/h</small> : null}
      </span>
    </button>
  );
}

function causeLabel(cause: OpportunityCause, t: Translate): string {
  const keys: Record<OpportunityCause, TranslationKey> = {
    "entry-speed": "lap.insights.cause.entrySpeed",
    "minimum-speed": "lap.insights.cause.minimumSpeed",
    "exit-speed": "lap.insights.cause.exitSpeed",
    "overall-pace": "lap.insights.cause.overallPace",
  };
  return t(keys[cause]);
}

function lapName(lap: LapResult, t: Translate): string {
  if (lap.completion === "partial-start") return t("lap.partialStart");
  if (lap.completion === "partial-end") return t("lap.partialEnd");
  if (lap.completion === "partial-both") return t("lap.partialBoth");
  return `${t("lap.lap")} ${lap.ordinal}${lap.durationSeconds === undefined ? "" : ` · ${formatLapTime(lap.durationSeconds)}`}`;
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, "0")}`;
}
