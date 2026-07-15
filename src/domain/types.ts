import type { LineString, Position } from "geojson";

export const GRAVITY_MPS2 = 9.80665;

export type VtaFormat = "modern-openvta" | "legacy-phone" | "legacy-imu-box" | "unknown";

export type TracePointSource =
  | "RawGps"
  | "LinearInterpolation"
  | "HermiteInterpolation"
  | "ImuHeading"
  | "DeadReckoning"
  | "Enhanced"
  | string;

export interface ParseWarning {
  lineNumber?: number;
  code: string;
  message: string;
  params?: Record<string, string | number>;
}

export interface GpsPoint {
  index: number;
  lineNumber: number;
  rawLine: string;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  speedKmh: number;
  bearingDegrees: number;
  satelliteCount: number;
  accuracyMeters?: number;
  provider?: string;
  elapsedRealtimeNanos?: number;
  epochMillis?: number;
  source: TracePointSource;
  confidence: number;
  derivedFromRawIndex?: number;
}

export interface SensorPoint {
  index: number;
  lineNumber: number;
  rawLine: string;
  elapsedSeconds: number;
  eventCode: number;
  orientationXDegrees?: number;
  orientationYDegrees?: number;
  orientationZDegrees?: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  accelUnit: "mps2" | "g";
  timestampNanos?: number;
  accuracy?: number;
  gyroX?: number;
  gyroY?: number;
  gyroZ?: number;
  rotationAzimuth?: number;
  rotationPitch?: number;
  rotationRoll?: number;
}

export interface VtaFile {
  sourceName: string;
  detectedFormat: VtaFormat;
  headers: string[];
  rawLines: string[];
  gpsPoints: GpsPoint[];
  enhancedPoints: GpsPoint[];
  sensorPoints: SensorPoint[];
  enhancementPresetId?: string;
  parseWarnings: ParseWarning[];
}

export interface VtaWorkspaceFile extends VtaFile {
  id: string;
  loadedAt: number;
}

export interface SourceVisibility {
  rawGps: boolean;
  enhancedGps: boolean;
}

export interface ActiveSegment {
  startIndex: number;
  endIndex: number;
  source: "manual" | "map" | "chart";
}

export interface SegmentSummary {
  pointCount: number;
  sensorCount: number;
  durationSeconds: number;
  distanceKm: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  minAltitudeMeters?: number;
  maxAltitudeMeters?: number;
  warningCount: number;
}

export interface ValidationRow {
  index: number;
  elapsedSeconds: number;
  speedKmh: number;
  deltaSpeedKmh: number;
  derivedAccelMps2: number;
}

export interface CalibrationPreset {
  id: string;
  name: string;
  createdAt: number;
  offsets: CalibrationOffsets;
}

export interface MapSettings {
  pointSize: number;
  tileUrl: string;
  speedThresholds: [number, number, number, number];
}

export interface ChartSettings {
  showRaw: boolean;
  showTransformed: boolean;
}

export type TransformMode = "raw" | "calibrated" | "filtered" | "compare";

export interface AxisAlignedRegion {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export interface RegionSummary {
  pointCount: number;
  distanceKm: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  minAltitudeMeters?: number;
  maxAltitudeMeters?: number;
}

export interface SummaryStats {
  durationSeconds: number;
  distanceKm: number;
  maxSpeedKmh: number;
  averageMovingSpeedKmh: number;
  minAltitudeMeters?: number;
  maxAltitudeMeters?: number;
  averageAccuracyMeters?: number;
  startTime?: number;
  endTime?: number;
  gpsCount: number;
  enhancedCount: number;
  sensorCount: number;
}

export interface CalibrationOffsets {
  x: number;
  y: number;
  z: number;
  unit: "mps2" | "g";
  sampleCount: number;
  sourceName?: string;
}

export interface CalibrationWindow {
  startElapsedSeconds?: number;
  endElapsedSeconds?: number;
}

export interface FilterSettings {
  enabled: boolean;
  cutoffHz: number;
  channels: {
    x: boolean;
    y: boolean;
    z: boolean;
  };
}

export interface FilterResult {
  sensors: SensorPoint[];
  sampleRateHz?: number;
  warning?: string;
}

export interface SegmentSelection {
  startIndex: number;
  endIndex: number;
}

export interface LoadedTextFile {
  name: string;
  text: string;
}

export type TrackDirection = "clockwise" | "counterclockwise" | "unknown";
export type TrackGateKind = "start-finish" | "sector" | "pit-in" | "pit-out";
export type TrackSectionKind = "corner-left" | "corner-right" | "straight";

export interface TrackGate {
  id: string;
  name: string;
  kind: TrackGateKind;
  line: LineString;
  forwardBearingDegrees: number;
  widthMeters: number;
}

export interface TrackSection {
  id: string;
  name: string;
  kind: TrackSectionKind;
  startDistanceMeters: number;
  endDistanceMeters: number;
  source?: "automatic" | "user";
  confidence?: number;
}

export interface TrackProfileSource {
  kind: "osm" | "recording" | "user";
  osmElementIds?: string[];
  fetchedAt?: string;
  attribution?: string;
  license?: "ODbL-1.0";
}

export interface TrackProfileV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  layoutName?: string;
  centerline: LineString;
  analysisLine?: LineString;
  direction: TrackDirection;
  startFinish?: TrackGate;
  sectorGates: TrackGate[];
  sections: TrackSection[];
  pitLane?: {
    line?: LineString;
    inGate?: TrackGate;
    outGate?: TrackGate;
  };
  source: TrackProfileSource;
  updatedAt: string;
}

export type LapCompletion = "complete" | "partial-start" | "partial-end" | "partial-both";
export type LapValidity = "valid" | "invalid" | "excluded";
export type LapFlag =
  | "out-lap"
  | "in-lap"
  | "pit"
  | "gps-gap"
  | "missed-sector"
  | "reverse-crossing"
  | "manual";

export interface TimedBoundary {
  id: string;
  source: "auto" | "manual" | "session-start" | "session-end";
  pointIndex: number;
  elapsedSeconds: number;
  coordinate: Position;
}

export interface LapResult {
  id: string;
  ordinal: number;
  completion: LapCompletion;
  validity: LapValidity;
  flags: LapFlag[];
  start: TimedBoundary;
  end: TimedBoundary;
  startIndex: number;
  endIndex: number;
  durationSeconds?: number;
  distanceKm: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
}

export type LapBoundaryOverride =
  | { id: string; type: "add"; pointIndex: number }
  | { id: string; type: "remove"; boundaryId: string };

export interface LapValidityOverride {
  lapId: string;
  validity: LapValidity;
}

export interface LapDetectionResult {
  gate: TrackGate;
  boundaries: TimedBoundary[];
  laps: LapResult[];
  warnings: string[];
}

export interface LapDistanceSample {
  distanceMeters: number;
  elapsedSeconds: number;
  speedKmh: number;
  latitude: number;
  longitude: number;
  sourceIndex: number;
}

export interface LapComparisonSample extends LapDistanceSample {
  referenceElapsedSeconds: number;
  deltaSeconds: number;
}

export interface LapSectionResult {
  id: string;
  lapId: string;
  sectionId: string;
  name: string;
  kind: TrackSectionKind;
  durationSeconds: number;
  deltaBestSeconds?: number;
  entrySpeedKmh: number;
  minimumSpeedKmh: number;
  averageSpeedKmh: number;
  maximumSpeedKmh: number;
  exitSpeedKmh: number;
  maxLateralG?: number;
  maxDecelerationG?: number;
  fromPartialLap: boolean;
  eligibleForBest: boolean;
}

export interface TimingSectorResult {
  id: string;
  lapId: string;
  sectorIndex: number;
  name: string;
  startGateId: string;
  endGateId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  fromPartialLap: boolean;
  eligibleForBest: boolean;
}

export interface TimingSectorAnalysisResult {
  sectors: TimingSectorResult[];
  missedSectorLapIds: string[];
  warnings: string[];
}

export interface CornerAnalysisResult {
  lapId: string;
  sectionId: string;
  name: string;
  kind: TrackSectionKind;
  durationSeconds: number;
  entrySpeedKmh: number;
  minimumSpeedKmh: number;
  exitSpeedKmh: number;
  maxLateralG?: number;
  maxDecelerationG?: number;
}

export interface LapAnalysisSettings {
  includePartialLapSectors: boolean;
}
