import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import type { LineString } from "geojson";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scopedLapComparison } from "../domain/sectionAnalysis";
import type { GpsPoint, LapResult, LapSectionResult, TrackSection } from "../domain/types";
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
}: LapExplorerProps) {
  const [scopeId, setScopeId] = useState(WHOLE_LAP);
  const [filter, setFilter] = useState<SectionFilter>("all");

  useEffect(() => {
    setScopeId(WHOLE_LAP);
  }, [profileId]);

  useEffect(() => {
    if (scopeId !== WHOLE_LAP && !sections.some((section) => section.id === scopeId)) setScopeId(WHOLE_LAP);
  }, [scopeId, sections]);

  const selectedLaps = useMemo(
    () => selectedLapIds
      .map((lapId) => laps.find((lap) => lap.id === lapId))
      .filter((lap): lap is LapResult => Boolean(lap)),
    [laps, selectedLapIds],
  );
  const referenceLap = laps.find((lap) => lap.id === referenceLapId);
  const scopeSection = sections.find((section) => section.id === scopeId);
  const scopeName = scopeSection?.name ?? "Whole lap";
  const navigationSections = sections.filter((section) =>
    section.id === scopeId ||
    filter === "all" ||
    (filter === "corners" && section.kind !== "straight") ||
    (filter === "straights" && section.kind === "straight"));
  const navigationIds = [WHOLE_LAP, ...navigationSections.map((section) => section.id)];
  const scopeIndex = navigationIds.indexOf(scopeId);
  const chartOption = useMemo(
    () => analysisLine
      ? buildChartOption(points, selectedLaps, referenceLap, analysisLine, scopeSection, primaryLapId)
      : emptyChartOption(),
    [analysisLine, points, primaryLapId, referenceLap, scopeSection, selectedLaps],
  );
  const resultByLapAndSection = useMemo(
    () => new Map(sectionResults.map((result) => [`${result.lapId}:${result.sectionId}`, result])),
    [sectionResults],
  );

  if (!analysisLine) {
    return (
      <Panel title="Lap Explorer" className="lap-wide-panel">
        <div className="empty-state">Create a valid complete lap to build the distance-based explorer.</div>
      </Panel>
    );
  }

  return (
    <section className="lap-explorer lap-wide-panel" aria-label="Lap Explorer">
      <Panel title="Lap Explorer" eyebrow="Distance-based Speed and Delta-T">
        <div className="lap-explorer-controls">
          <div className="segmented" role="group" aria-label="Section type filter">
            {(["all", "corners", "straights"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : undefined}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : value === "corners" ? "Corners" : "Straights"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button icon-button"
            aria-label="Previous scope"
            disabled={scopeIndex <= 0}
            onClick={() => setScopeId(navigationIds[scopeIndex - 1])}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <label className="field lap-explorer-scope">
            <span>Analysis scope</span>
            <select value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
              <option value={WHOLE_LAP}>Whole lap</option>
              {navigationSections.map((section) => (
                <option value={section.id} key={section.id}>{section.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button icon-button"
            aria-label="Next scope"
            disabled={scopeIndex < 0 || scopeIndex >= navigationIds.length - 1}
            onClick={() => setScopeId(navigationIds[scopeIndex + 1])}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
          <span className="lap-explorer-reference">
            Reference: {referenceLap ? lapName(referenceLap) : "None"}
          </span>
        </div>
      </Panel>

      <ChartPanel
        title={`${scopeName} lap comparison`}
        ariaLabel={`${scopeName} Speed and Delta-T by distance`}
        option={chartOption}
        className="lap-explorer-chart"
      />

      <Panel title="Analysis sector matrix">
        {sections.length && selectedLaps.length ? (
          <div className="table-wrap">
            <table aria-label="Analysis sector by lap matrix" className="lap-sector-matrix">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Type</th>
                  {selectedLaps.map((lap) => <th key={lap.id}>{lapName(lap)}</th>)}
                  <th>Graph</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <tr key={section.id} className={section.id === scopeId ? "lap-primary-row" : undefined}>
                    <th scope="row">{section.name}</th>
                    <td>{sectionKind(section)}</td>
                    {selectedLaps.map((lap) => {
                      const result = resultByLapAndSection.get(`${lap.id}:${section.id}`);
                      return <td key={lap.id}>{result ? metricCell(result) : "—"}</td>;
                    })}
                    <td>
                      <button type="button" className="button ghost" aria-label={`Analyze ${section.name}`} onClick={() => setScopeId(section.id)}>
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">Select laps and generate analysis sectors to compare them.</div>}
      </Panel>

      <Panel title={`${scopeName} metrics`}>
        {scopeSection ? (
          <div className="table-wrap">
            <table aria-label="Selected scope lap metrics">
              <thead>
                <tr>
                  <th>Lap</th>
                  <th>Duration</th>
                  <th>Delta best</th>
                  <th>Entry speed</th>
                  <th>Minimum speed</th>
                  <th>Average speed</th>
                  <th>Maximum speed</th>
                  <th>Exit speed</th>
                  <th>Max lateral G</th>
                  <th>Max deceleration G</th>
                  <th>Partial lap</th>
                  <th>Best eligible</th>
                </tr>
              </thead>
              <tbody>
                {selectedLaps.map((lap) => {
                  const result = resultByLapAndSection.get(`${lap.id}:${scopeSection.id}`);
                  return (
                    <tr key={lap.id}>
                      <th scope="row">{lapName(lap)}</th>
                      <td>{result ? formatDuration(result.durationSeconds) : "—"}</td>
                      <td>{result?.deltaBestSeconds === undefined ? "—" : formatDelta(result.deltaBestSeconds)}</td>
                      <td>{formatSpeed(result?.entrySpeedKmh)}</td>
                      <td>{formatSpeed(result?.minimumSpeedKmh)}</td>
                      <td>{formatSpeed(result?.averageSpeedKmh)}</td>
                      <td>{formatSpeed(result?.maximumSpeedKmh)}</td>
                      <td>{formatSpeed(result?.exitSpeedKmh)}</td>
                      <td>{formatG(result?.maxLateralG)}</td>
                      <td>{formatG(result?.maxDecelerationG)}</td>
                      <td>{result ? yesNo(result.fromPartialLap) : "—"}</td>
                      <td>{result ? yesNo(result.eligibleForBest) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">Choose an analysis sector to inspect its lap metrics.</div>}
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
): EChartsOption {
  const comparisons = laps.map((lap) => ({
    lap,
    samples: scopedLapComparison(points, lap, referenceLap, analysisLine, section, 5),
  }));
  const speedSeries = comparisons.map(({ lap, samples }, index) => ({
    name: `${lapName(lap)} Speed`,
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
        name: `${lapName(lap)} Delta-T`,
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
    xAxis: { type: "value", name: "Distance (m)", nameLocation: "middle", nameGap: 30 },
    yAxis: [
      { type: "value", name: "Speed (km/h)" },
      { type: "value", name: "Delta-T (s)", splitLine: { show: false } },
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

function lapName(lap: LapResult): string {
  if (lap.completion === "partial-start") return "Partial start";
  if (lap.completion === "partial-end") return "Partial end";
  if (lap.completion === "partial-both") return "Partial fragment";
  return `Lap ${lap.ordinal}`;
}

function sectionKind(section: TrackSection): string {
  if (section.kind === "corner-left") return "Left corner";
  if (section.kind === "corner-right") return "Right corner";
  return "Straight";
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

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}
