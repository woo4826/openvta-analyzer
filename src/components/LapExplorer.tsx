import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import type { LineString } from "geojson";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scopedLapComparison } from "../domain/sectionAnalysis";
import type { GpsPoint, LapResult, LapSectionResult, TrackSection } from "../domain/types";
import type { Translate } from "../i18n/messages";
import { useI18n } from "../i18n/useI18n";
import { ChartPanel } from "./ChartPanel";
import { Panel } from "./ui";

type SectionFilter = "all" | "corners" | "straights";

export interface LapExplorerProps {
  profileId?: string;
  points: GpsPoint[];
  laps: LapResult[];
  selectedLapIds: string[];
  primaryLapId?: string;
  referenceLapId?: string;
  analysisLine?: LineString;
  sections: TrackSection[];
  sectionResults: LapSectionResult[];
  scopeId?: string;
  onScopeIdChange?: (scopeId: string) => void;
}

const LAP_COLORS = ["#0f766e", "#d97706", "#2563eb", "#be3b3b", "#7c3aed"];
const WHOLE_LAP = "whole-lap";

export function LapExplorer({
  profileId,
  points,
  laps,
  selectedLapIds,
  primaryLapId,
  referenceLapId,
  analysisLine,
  sections,
  sectionResults,
  scopeId: controlledScopeId,
  onScopeIdChange,
}: LapExplorerProps) {
  const { t } = useI18n();
  const [internalScopeId, setInternalScopeId] = useState(WHOLE_LAP);
  const scopeId = controlledScopeId ?? internalScopeId;
  const [filter, setFilter] = useState<SectionFilter>("all");

  function selectScope(scope: string) {
    if (controlledScopeId === undefined) setInternalScopeId(scope);
    onScopeIdChange?.(scope);
  }

  useEffect(() => {
    selectScope(WHOLE_LAP);
    // The profile identity is the reset boundary for both controlled and internal scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => {
    if (scopeId !== WHOLE_LAP && !sections.some((section) => section.id === scopeId)) selectScope(WHOLE_LAP);
    // `selectScope` intentionally follows the latest controlled callback without resetting valid scopes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, sections]);

  const selectedLaps = useMemo(
    () => selectedLapIds
      .map((lapId) => laps.find((lap) => lap.id === lapId))
      .filter((lap): lap is LapResult => Boolean(lap)),
    [laps, selectedLapIds],
  );
  const referenceLap = laps.find((lap) => lap.id === referenceLapId);
  const scopeSection = sections.find((section) => section.id === scopeId);
  const scopeName = scopeSection?.name ?? t("lap.explorer.wholeLap");
  const navigationSections = sections.filter((section) =>
    section.id === scopeId ||
    filter === "all" ||
    (filter === "corners" && section.kind !== "straight") ||
    (filter === "straights" && section.kind === "straight"));
  const navigationIds = [WHOLE_LAP, ...navigationSections.map((section) => section.id)];
  const scopeIndex = navigationIds.indexOf(scopeId);
  const chartOption = useMemo(
    () => analysisLine
      ? buildChartOption(points, selectedLaps, referenceLap, analysisLine, scopeSection, primaryLapId, t)
      : emptyChartOption(),
    [analysisLine, points, primaryLapId, referenceLap, scopeSection, selectedLaps, t],
  );
  const resultByLapAndSection = useMemo(
    () => new Map(sectionResults.map((result) => [`${result.lapId}:${result.sectionId}`, result])),
    [sectionResults],
  );

  if (!analysisLine) {
    return (
      <Panel title={t("lap.explorer.title")} className="lap-wide-panel">
        <div className="empty-state">{t("lap.explorer.noLine")}</div>
      </Panel>
    );
  }

  return (
    <section className="lap-explorer lap-wide-panel" aria-label={t("lap.explorer.title")}>
      <Panel title={t("lap.explorer.title")} eyebrow={t("lap.explorer.eyebrow")}>
        <div className="lap-explorer-controls">
          <div className="segmented" role="group" aria-label={t("lap.explorer.filterAria")}>
            {(["all", "corners", "straights"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : undefined}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? t("lap.explorer.all") : value === "corners" ? t("lap.explorer.corners") : t("lap.explorer.straights")}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button icon-button"
            aria-label={t("lap.explorer.previous")}
            disabled={scopeIndex <= 0}
            onClick={() => selectScope(navigationIds[scopeIndex - 1])}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <label className="field lap-explorer-scope">
            <span>{t("lap.explorer.scope")}</span>
            <select value={scopeId} onChange={(event) => selectScope(event.target.value)}>
              <option value={WHOLE_LAP}>{t("lap.explorer.wholeLap")}</option>
              {navigationSections.map((section) => (
                <option value={section.id} key={section.id}>{section.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button icon-button"
            aria-label={t("lap.explorer.next")}
            disabled={scopeIndex < 0 || scopeIndex >= navigationIds.length - 1}
            onClick={() => selectScope(navigationIds[scopeIndex + 1])}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
          <span className="lap-explorer-reference">
            {t("lap.explorer.reference", { lap: referenceLap ? lapName(referenceLap, t) : t("lap.explorer.none") })}
          </span>
        </div>
      </Panel>

      <ChartPanel
        title={t("lap.explorer.chartTitle", { scope: scopeName })}
        ariaLabel={t("lap.explorer.chartAria", { scope: scopeName })}
        option={chartOption}
        className="lap-explorer-chart"
      />

      <Panel title={t("lap.explorer.matrixTitle")}>
        {sections.length && selectedLaps.length ? (
          <div className="table-wrap">
            <table aria-label={t("lap.explorer.matrixAria")} className="lap-sector-matrix">
              <thead>
                <tr>
                  <th>{t("lap.explorer.scopeColumn")}</th>
                  <th>{t("lap.explorer.typeColumn")}</th>
                  {selectedLaps.map((lap) => <th key={lap.id}>{lapName(lap, t)}</th>)}
                  <th>{t("lap.explorer.graphColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <tr key={section.id} className={section.id === scopeId ? "lap-primary-row" : undefined}>
                    <th scope="row">{section.name}</th>
                    <td>{sectionKind(section, t)}</td>
                    {selectedLaps.map((lap) => {
                      const result = resultByLapAndSection.get(`${lap.id}:${section.id}`);
                      return <td key={lap.id}>{result ? metricCell(result) : "—"}</td>;
                    })}
                    <td>
                      <button type="button" className="button ghost" aria-label={t("lap.explorer.analyzeAria", { scope: section.name })} onClick={() => selectScope(section.id)}>
                        {t("lap.explorer.analyze")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">{t("lap.explorer.emptyMatrix")}</div>}
      </Panel>

      <Panel title={t("lap.explorer.metricsTitle", { scope: scopeName })}>
        {scopeSection ? (
          <div className="table-wrap">
            <table aria-label={t("lap.explorer.metricsAria")}>
              <thead>
                <tr>
                  <th>{t("lap.lap")}</th>
                  <th>{t("lap.duration")}</th>
                  <th>{t("lap.deltaBest")}</th>
                  <th>{t("lap.entrySpeed")}</th>
                  <th>{t("lap.minimumSpeed")}</th>
                  <th>{t("lap.explorer.averageSpeed")}</th>
                  <th>{t("lap.explorer.maximumSpeed")}</th>
                  <th>{t("lap.exitSpeed")}</th>
                  <th>{t("lap.maxLateralG")}</th>
                  <th>{t("lap.maxDecelerationG")}</th>
                  <th>{t("lap.explorer.partialLap")}</th>
                  <th>{t("lap.bestEligible")}</th>
                </tr>
              </thead>
              <tbody>
                {selectedLaps.map((lap) => {
                  const result = resultByLapAndSection.get(`${lap.id}:${scopeSection.id}`);
                  return (
                    <tr key={lap.id}>
                      <th scope="row">{lapName(lap, t)}</th>
                      <td>{result ? formatDuration(result.durationSeconds) : "—"}</td>
                      <td>{result?.deltaBestSeconds === undefined ? "—" : formatDelta(result.deltaBestSeconds)}</td>
                      <td>{formatSpeed(result?.entrySpeedKmh)}</td>
                      <td>{formatSpeed(result?.minimumSpeedKmh)}</td>
                      <td>{formatSpeed(result?.averageSpeedKmh)}</td>
                      <td>{formatSpeed(result?.maximumSpeedKmh)}</td>
                      <td>{formatSpeed(result?.exitSpeedKmh)}</td>
                      <td>{formatG(result?.maxLateralG)}</td>
                      <td>{formatG(result?.maxDecelerationG)}</td>
                      <td>{result ? yesNo(result.fromPartialLap, t) : "—"}</td>
                      <td>{result ? yesNo(result.eligibleForBest, t) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">{t("lap.explorer.chooseScope")}</div>}
      </Panel>
    </section>
  );
}

function buildChartOption(
  points: GpsPoint[],
  laps: LapResult[],
  referenceLap: LapResult | undefined,
  analysisLine: LineString,
  section: TrackSection | undefined,
  primaryLapId: string | undefined,
  t: Translate,
): EChartsOption {
  const comparisons = laps.map((lap) => ({
    lap,
    samples: scopedLapComparison(points, lap, referenceLap, analysisLine, section, 5),
  }));
  const speedSeries = comparisons.map(({ lap, samples }, index) => ({
    name: `${lapName(lap, t)} ${t("lap.chart.speed")}`,
    type: "line" as const,
    showSymbol: false,
    yAxisIndex: 0,
    lineStyle: {
      color: LAP_COLORS[index % LAP_COLORS.length],
      width: lap.id === primaryLapId ? 3 : 2,
    },
    data: samples.map((sample) => [sample.distanceMeters, sample.speedKmh]),
  }));
  const deltaSeries = referenceLap
    ? comparisons.filter(({ lap }) => lap.id !== referenceLap.id).map(({ lap, samples }, index) => ({
        name: `${lapName(lap, t)} ${t("lap.chart.delta")}`,
        type: "line" as const,
        showSymbol: false,
        yAxisIndex: 1,
        lineStyle: { color: LAP_COLORS[index % LAP_COLORS.length], width: 1.5, type: "dashed" as const },
        data: samples.map((sample) => [sample.distanceMeters, sample.deltaSeconds]),
      }))
    : [];
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { type: "scroll", top: 0 },
    toolbox: { right: 8, feature: { restore: {} } },
    grid: { left: 60, right: 65, top: 48, bottom: 75 },
    xAxis: { type: "value", name: `${t("lap.distance")} (m)`, nameLocation: "middle", nameGap: 30 },
    yAxis: [
      { type: "value", name: `${t("lap.chart.speed")} (km/h)` },
      { type: "value", name: `${t("lap.chart.delta")} (s)`, splitLine: { show: false } },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      { type: "slider", xAxisIndex: 0, bottom: 8, height: 22, filterMode: "none" },
    ],
    series: [...speedSeries, ...deltaSeries],
  };
}

function emptyChartOption(): EChartsOption {
  return { xAxis: { type: "value" }, yAxis: { type: "value" }, series: [] };
}

function metricCell(result: LapSectionResult) {
  return <span className="lap-matrix-metric">{formatDuration(result.durationSeconds)} <small>{formatDelta(result.deltaBestSeconds ?? 0)}</small></span>;
}

function lapName(lap: LapResult, t: Translate): string {
  if (lap.completion === "partial-start") return t("lap.partialStart");
  if (lap.completion === "partial-end") return t("lap.partialEnd");
  if (lap.completion === "partial-both") return t("lap.partialBoth");
  return `${t("lap.lap")} ${lap.ordinal}`;
}

function sectionKind(section: TrackSection, t: Translate): string {
  if (section.kind === "corner-left") return t("lap.cornerLeft");
  if (section.kind === "corner-right") return t("lap.cornerRight");
  return t("lap.straight");
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(3)} s`;
}

function formatDelta(seconds: number): string {
  const normalized = Math.abs(seconds) < 0.0005 ? 0 : seconds;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(3)} s`;
}

function formatSpeed(speedKmh: number | undefined): string {
  return speedKmh === undefined ? "—" : `${speedKmh.toFixed(1)} km/h`;
}

function formatG(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(2)} g`;
}

function yesNo(value: boolean, t: Translate): string {
  return value ? t("lap.yes") : t("lap.no");
}
