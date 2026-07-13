import type { GpsPoint, SourceVisibility } from "../domain/types";

export type LapGpsSourceKey = keyof SourceVisibility;

export interface LapGpsSource {
  key?: LapGpsSourceKey;
  points: GpsPoint[];
  visibility: SourceVisibility;
}

interface GpsSources {
  gpsPoints: GpsPoint[];
  enhancedPoints: GpsPoint[];
}

export function selectLapGpsSource(file: GpsSources, requested: SourceVisibility): LapGpsSource {
  if (requested.enhancedGps && file.enhancedPoints.length) {
    return selectedSource("enhancedGps", file.enhancedPoints);
  }
  if (requested.rawGps && file.gpsPoints.length) {
    return selectedSource("rawGps", file.gpsPoints);
  }
  if (file.enhancedPoints.length) {
    return selectedSource("enhancedGps", file.enhancedPoints);
  }
  if (file.gpsPoints.length) {
    return selectedSource("rawGps", file.gpsPoints);
  }
  return { points: [], visibility: { rawGps: false, enhancedGps: false } };
}

export function lapWorkspaceKey(
  fileId: string | undefined,
  sourceKey: LapGpsSourceKey | undefined,
): string | undefined {
  return fileId && sourceKey ? `${fileId}::${sourceKey}` : undefined;
}

function selectedSource(key: LapGpsSourceKey, points: GpsPoint[]): LapGpsSource {
  return {
    key,
    points,
    visibility: {
      rawGps: key === "rawGps",
      enhancedGps: key === "enhancedGps",
    },
  };
}
