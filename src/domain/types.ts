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
