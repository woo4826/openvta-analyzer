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
  const points = visiblePoints ?? displayGpsPoints(file);
  const selected = points[selectedPointIndex];
  const segmentSummary = activeSegment
    ? summarizeSegment(file, file.sensorPoints, activeSegment, sourceVisibility)
    : undefined;
  const regionSummary = region ? summarizeAxisAlignedRegion(points, region) : undefined;

  return (
    <section className="overview-grid">
      <div className="panel">
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
        </div>
      </div>

      <div className="content-band">
        <div className="panel">
          <div className="panel-header">
            <h3>Summary</h3>
          </div>
          <div className="panel-body metric-grid">
            <Metric label="Distance" value={`${stats.distanceKm.toFixed(3)} km`} />
            <Metric label="Duration" value={formatDuration(stats.durationSeconds)} />
            <Metric label="Max speed" value={`${stats.maxSpeedKmh.toFixed(1)} km/h`} />
            <Metric label="Moving average" value={`${stats.averageMovingSpeedKmh.toFixed(1)} km/h`} />
            <Metric label="GPS / Enhanced" value={`${stats.gpsCount} / ${stats.enhancedCount}`} />
            <Metric label="Sensor rows" value={String(stats.sensorCount)} />
            <Metric
              label="Altitude range"
              value={
                stats.minAltitudeMeters === undefined || stats.maxAltitudeMeters === undefined
                  ? "No altitude"
                  : `${stats.minAltitudeMeters.toFixed(0)}-${stats.maxAltitudeMeters.toFixed(0)} m`
              }
            />
            <Metric
              label="Avg accuracy"
              value={stats.averageAccuracyMeters === undefined ? "No data" : `${stats.averageAccuracyMeters.toFixed(2)} m`}
            />
          </div>
        </div>

        {segmentSummary ? (
          <div className="panel">
            <div className="panel-header">
              <h3>Segment</h3>
              <span>
                {activeSegment?.startIndex}-{activeSegment?.endIndex}
              </span>
            </div>
            <div className="panel-body metric-grid">
              <Metric label="Segment points" value={String(segmentSummary.pointCount)} />
              <Metric label="Distance" value={`${segmentSummary.distanceKm.toFixed(3)} km`} />
              <Metric label="Duration" value={formatDuration(segmentSummary.durationSeconds)} />
              <Metric label="Max speed" value={`${segmentSummary.maxSpeedKmh.toFixed(1)} km/h`} />
              <Metric label="Avg speed" value={`${segmentSummary.averageSpeedKmh.toFixed(1)} km/h`} />
              <Metric label="Sensor rows" value={String(segmentSummary.sensorCount)} />
              <Metric label="Warnings" value={String(segmentSummary.warningCount)} />
              <Metric
                label="Altitude range"
                value={formatAltitudeRange(segmentSummary.minAltitudeMeters, segmentSummary.maxAltitudeMeters)}
              />
            </div>
          </div>
        ) : null}

        {regionSummary ? (
          <div className="panel">
            <div className="panel-header">
              <h3>Region</h3>
              <span>Axis-aligned bounds</span>
            </div>
            <div className="panel-body metric-grid">
              <Metric label="Region points" value={String(regionSummary.pointCount)} />
              <Metric label="Distance" value={`${regionSummary.distanceKm.toFixed(3)} km`} />
              <Metric label="Max speed" value={`${regionSummary.maxSpeedKmh.toFixed(1)} km/h`} />
              <Metric label="Avg speed" value={`${regionSummary.averageSpeedKmh.toFixed(1)} km/h`} />
              <Metric
                label="Altitude range"
                value={formatAltitudeRange(regionSummary.minAltitudeMeters, regionSummary.maxAltitudeMeters)}
              />
            </div>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-header">
            <h3>Selected Point</h3>
          </div>
          <div className="panel-body">
            {selected ? (
              <div className="metric-grid">
                <Metric label="Index" value={String(selectedPointIndex)} />
                <Metric label="Time" value={`${selected.date} ${selected.time}`} />
                <Metric label="Latitude" value={selected.latitude.toFixed(8)} />
                <Metric label="Longitude" value={selected.longitude.toFixed(8)} />
                <Metric label="Speed" value={`${selected.speedKmh.toFixed(1)} km/h`} />
                <Metric label="Source" value={selected.source} />
              </div>
            ) : (
              <div className="empty-state">No GPS point selected.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Warnings</h3>
          </div>
          <div className="panel-body">
            <WarningList warnings={file.parseWarnings} extraWarning={filterWarning} />
          </div>
        </div>
      </div>
    </section>
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

function formatAltitudeRange(minAltitudeMeters?: number, maxAltitudeMeters?: number): string {
  if (minAltitudeMeters === undefined || maxAltitudeMeters === undefined) {
    return "No altitude";
  }
  return `${minAltitudeMeters.toFixed(0)}-${maxAltitudeMeters.toFixed(0)} m`;
}
