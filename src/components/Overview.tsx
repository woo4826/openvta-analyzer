import type {
  ActiveSegment,
  AxisAlignedRegion,
  GpsPoint,
  MapSettings,
  SourceVisibility,
  SummaryStats,
  VtaFile,
} from "../domain/types";
import { summarizeAxisAlignedRegion, summarizeSegment } from "../domain/analysis";
import { displayGpsPoints } from "../domain/statistics";
import { useI18n } from "../i18n/useI18n";
import { RouteMap } from "./RouteMap";
import { WarningList } from "./WarningList";

interface OverviewProps {
  file: VtaFile;
  stats: SummaryStats;
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
  sourceVisibility: SourceVisibility;
  mapSettings: MapSettings;
  activeSegment?: ActiveSegment;
  region?: AxisAlignedRegion;
  onSegmentChange: (segment?: ActiveSegment) => void;
  onRegionChange: (region?: AxisAlignedRegion) => void;
  onMapSettingsChange: (settings: MapSettings) => void;
  visiblePoints?: GpsPoint[];
  filterWarning?: string;
}

export function Overview({
  file,
  stats,
  selectedPointIndex,
  onSelectedPointIndex,
  sourceVisibility,
  mapSettings,
  activeSegment,
  region,
  onSegmentChange,
  onRegionChange,
  onMapSettingsChange,
  visiblePoints,
  filterWarning,
}: OverviewProps) {
  const { t } = useI18n();
  const points = visiblePoints ?? displayGpsPoints(file);
  const selected = points[selectedPointIndex];
  const segmentSummary = activeSegment
    ? summarizeSegment(file, file.sensorPoints, activeSegment, sourceVisibility)
    : undefined;
  const regionSummary = region ? summarizeAxisAlignedRegion(points, region) : undefined;

  return (
    <section className="overview-grid">
      <div className="panel" data-tour="overview-panel">
        <div className="panel-header">
          <h2>{file.sourceName}</h2>
          <span>{file.detectedFormat}</span>
        </div>
        <div className="panel-body">
          <RouteMap
            points={points}
            selectedIndex={selectedPointIndex}
            sourceVisibility={sourceVisibility}
            settings={mapSettings}
            segment={activeSegment}
            region={region}
            onSelectedIndex={onSelectedPointIndex}
            onSegmentChange={onSegmentChange}
            onRegionChange={onRegionChange}
            onSettingsChange={onMapSettingsChange}
          />
          <PointTimeline points={points} selectedPointIndex={selectedPointIndex} onSelectedPointIndex={onSelectedPointIndex} />
        </div>
      </div>

      <div className="content-band">
        <div className="panel">
          <div className="panel-header">
            <h3>{t("overview.summary")}</h3>
          </div>
          <div className="panel-body metric-grid">
            <Metric label={t("overview.distance")} value={`${stats.distanceKm.toFixed(3)} km`} />
            <Metric label={t("overview.duration")} value={formatDuration(stats.durationSeconds)} />
            <Metric label={t("overview.maxSpeed")} value={`${stats.maxSpeedKmh.toFixed(1)} km/h`} />
            <Metric label={t("overview.movingAverage")} value={`${stats.averageMovingSpeedKmh.toFixed(1)} km/h`} />
            <Metric label={t("overview.gpsEnhanced")} value={`${stats.gpsCount} / ${stats.enhancedCount}`} />
            <Metric label={t("overview.sensorRows")} value={String(stats.sensorCount)} />
            <Metric
              label={t("overview.altitudeRange")}
              value={
                stats.minAltitudeMeters === undefined || stats.maxAltitudeMeters === undefined
                  ? t("overview.noAltitude")
                  : `${stats.minAltitudeMeters.toFixed(0)}-${stats.maxAltitudeMeters.toFixed(0)} m`
              }
            />
            <Metric
              label={t("overview.avgAccuracy")}
              value={
                stats.averageAccuracyMeters === undefined
                  ? t("overview.noData")
                  : `${stats.averageAccuracyMeters.toFixed(2)} m`
              }
            />
          </div>
        </div>

        {segmentSummary ? (
          <div className="panel">
            <div className="panel-header">
              <h3>{t("overview.segment")}</h3>
              <span>
                {activeSegment?.startIndex}-{activeSegment?.endIndex}
              </span>
            </div>
            <div className="panel-body metric-grid">
              <Metric label={t("overview.segmentPoints")} value={String(segmentSummary.pointCount)} />
              <Metric label={t("overview.distance")} value={`${segmentSummary.distanceKm.toFixed(3)} km`} />
              <Metric label={t("overview.duration")} value={formatDuration(segmentSummary.durationSeconds)} />
              <Metric label={t("overview.maxSpeed")} value={`${segmentSummary.maxSpeedKmh.toFixed(1)} km/h`} />
              <Metric label={t("overview.avgSpeed")} value={`${segmentSummary.averageSpeedKmh.toFixed(1)} km/h`} />
              <Metric label={t("overview.sensorRows")} value={String(segmentSummary.sensorCount)} />
              <Metric label={t("overview.warnings")} value={String(segmentSummary.warningCount)} />
              <Metric
                label={t("overview.altitudeRange")}
                value={formatAltitudeRange(segmentSummary.minAltitudeMeters, segmentSummary.maxAltitudeMeters, t("overview.noAltitude"))}
              />
            </div>
          </div>
        ) : null}

        {regionSummary ? (
          <div className="panel">
            <div className="panel-header">
              <h3>{t("overview.region")}</h3>
              <span>{t("overview.axisAlignedBounds")}</span>
            </div>
            <div className="panel-body metric-grid">
              <Metric label={t("overview.regionPoints")} value={String(regionSummary.pointCount)} />
              <Metric label={t("overview.distance")} value={`${regionSummary.distanceKm.toFixed(3)} km`} />
              <Metric label={t("overview.maxSpeed")} value={`${regionSummary.maxSpeedKmh.toFixed(1)} km/h`} />
              <Metric label={t("overview.avgSpeed")} value={`${regionSummary.averageSpeedKmh.toFixed(1)} km/h`} />
              <Metric
                label={t("overview.altitudeRange")}
                value={formatAltitudeRange(regionSummary.minAltitudeMeters, regionSummary.maxAltitudeMeters, t("overview.noAltitude"))}
              />
            </div>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-header">
            <h3>{t("overview.selectedPoint")}</h3>
          </div>
          <div className="panel-body">
            {selected ? (
              <div className="metric-grid">
                <Metric label={t("overview.index")} value={String(selectedPointIndex)} />
                <Metric label={t("overview.time")} value={`${selected.date} ${selected.time}`} />
                <Metric label={t("overview.latitude")} value={selected.latitude.toFixed(8)} />
                <Metric label={t("overview.longitude")} value={selected.longitude.toFixed(8)} />
                <Metric label={t("overview.speed")} value={`${selected.speedKmh.toFixed(1)} km/h`} />
                <Metric label={t("overview.source")} value={selected.source} />
              </div>
            ) : (
              <div className="empty-state">{t("overview.noGpsPointSelected")}</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>{t("overview.warnings")}</h3>
          </div>
          <div className="panel-body">
            <WarningList warnings={file.parseWarnings} extraWarning={filterWarning} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function PointTimeline({
  points,
  selectedPointIndex,
  onSelectedPointIndex,
}: {
  points: GpsPoint[];
  selectedPointIndex: number;
  onSelectedPointIndex: (index: number) => void;
}) {
  const { t } = useI18n();
  const selected = points[selectedPointIndex];
  return (
    <div className="point-timeline">
      <div className="point-timeline-header">
        <label htmlFor="point-timeline">{t("overview.pointTimeline")}</label>
        <output htmlFor="point-timeline">
          {selected ? selectedPointIndex + 1 : 0} / {points.length}
        </output>
      </div>
      <input
        id="point-timeline"
        type="range"
        min={0}
        max={Math.max(points.length - 1, 0)}
        step={1}
        value={selected ? selectedPointIndex : 0}
        disabled={points.length <= 1}
        aria-label={t("overview.pointTimeline")}
        aria-valuetext={selected ? t("overview.pointTimelineValue", {
          current: selectedPointIndex + 1,
          total: points.length,
          date: selected.date,
          time: selected.time,
        }) : undefined}
        onChange={(event) => onSelectedPointIndex(Number(event.currentTarget.value))}
      />
      <div className="point-timeline-meta">
        <span>{selected ? `${selected.date} ${selected.time}` : t("overview.noGpsPointSelected")}</span>
        {selected ? <span>{selected.speedKmh.toFixed(1)} km/h</span> : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function formatAltitudeRange(minAltitudeMeters: number | undefined, maxAltitudeMeters: number | undefined, emptyLabel: string): string {
  if (minAltitudeMeters === undefined || maxAltitudeMeters === undefined) {
    return emptyLabel;
  }
  return `${minAltitudeMeters.toFixed(0)}-${maxAltitudeMeters.toFixed(0)} m`;
}
