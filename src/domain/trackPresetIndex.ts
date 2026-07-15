import { haversineMeters, routeDistanceMeters } from "./geometry";
import { validateTrackProfile } from "./trackProfile";
import type { GpsPoint, TrackDirection, TrackProfileV1 } from "./types";

export interface TrackPresetIndexEntry {
  id: string;
  venueName: string;
  layoutName: string;
  href: string;
  bbox: [number, number, number, number];
  lengthMeters: number;
  direction: TrackDirection;
  revision: string;
  quality: "curated" | "generated";
}

export interface TrackPresetIndexV1 {
  schemaVersion: 1;
  kind: "openvta-track-index";
  generatedAt: string;
  entries: TrackPresetIndexEntry[];
}

const INDEX_PATH = "tracks/index.v1.json";
const DEFAULT_BASE_URL = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

export function parseTrackPresetIndex(value: unknown): TrackPresetIndexV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.kind !== "openvta-track-index") {
    throw new Error("Unsupported hosted track preset index.");
  }
  if (!isIsoTimestamp(value.generatedAt) || !Array.isArray(value.entries)) {
    throw new Error("Hosted track preset index metadata is invalid.");
  }
  const entries = value.entries.map(parseEntry);
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Hosted track preset ids must be unique.");
  }
  return {
    schemaVersion: 1,
    kind: "openvta-track-index",
    generatedAt: value.generatedAt,
    entries,
  };
}

export function resolveTrackPresetUrl(baseUrl: string, href: string): string {
  assertSafeHref(href);
  const normalizedBase = `/${baseUrl.split("/").filter(Boolean).join("/")}`;
  return `${normalizedBase === "/" ? "" : normalizedBase}/tracks/${href}`;
}

export function candidateTrackPresets(
  entries: TrackPresetIndexEntry[],
  points: GpsPoint[],
): TrackPresetIndexEntry[] {
  if (!points.length) return [];
  const pointBounds = recordingBounds(points);
  const diagonalMeters = haversineMeters(
    [pointBounds.west, pointBounds.south],
    [pointBounds.east, pointBounds.north],
  );
  const paddingMeters = Math.max(750, diagonalMeters * 0.15);
  const latitudePadding = paddingMeters / 111_320;
  const centerLatitude = (pointBounds.south + pointBounds.north) / 2;
  const longitudePadding = paddingMeters / Math.max(1, 111_320 * Math.cos(centerLatitude * Math.PI / 180));
  const expanded = {
    west: pointBounds.west - longitudePadding,
    south: pointBounds.south - latitudePadding,
    east: pointBounds.east + longitudePadding,
    north: pointBounds.north + latitudePadding,
  };
  const recordedDistance = routeDistanceMeters(points.map((point) => [point.longitude, point.latitude]));
  return entries.filter((entry) => {
    const [west, south, east, north] = entry.bbox;
    const intersects = west <= expanded.east && east >= expanded.west && south <= expanded.north && north >= expanded.south;
    const hasEnoughRecordedDistance = recordedDistance === 0 || recordedDistance >= entry.lengthMeters * 0.35;
    return intersects && hasEnoughRecordedDistance;
  });
}

export async function loadHostedTrackPresets(
  points: GpsPoint[],
  baseUrl = DEFAULT_BASE_URL,
  request: typeof fetch = fetch,
): Promise<TrackProfileV1[]> {
  const indexResponse = await request(resolveBaseUrl(baseUrl, INDEX_PATH), {
    headers: { Accept: "application/json" },
  });
  if (!indexResponse.ok) {
    throw new Error(`Hosted track preset index responded with ${indexResponse.status}.`);
  }
  const index = parseTrackPresetIndex(await indexResponse.json());
  const profiles = await Promise.all(candidateTrackPresets(index.entries, points).map(async (entry) => {
    try {
      const response = await request(resolveTrackPresetUrl(baseUrl, entry.href), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return undefined;
      const result = validateTrackProfile(await response.json());
      if (!result.profile || result.profile.id !== entry.id) return undefined;
      return result.profile;
    } catch {
      return undefined;
    }
  }));
  return profiles.filter((profile): profile is TrackProfileV1 => Boolean(profile));
}

function parseEntry(value: unknown): TrackPresetIndexEntry {
  if (!isRecord(value) || !nonEmpty(value.id) || !nonEmpty(value.venueName) || !nonEmpty(value.layoutName)) {
    throw new Error("Hosted track preset entry identity is invalid.");
  }
  if (!nonEmpty(value.href)) throw new Error("Hosted track preset href is invalid.");
  assertSafeHref(value.href);
  if (!Array.isArray(value.bbox) || value.bbox.length !== 4 || !value.bbox.every(finite)) {
    throw new Error("Hosted track preset bbox is invalid.");
  }
  const [west, south, east, north] = value.bbox;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("Hosted track preset bbox is invalid.");
  }
  if (!finite(value.lengthMeters) || value.lengthMeters < 150 || value.lengthMeters > 100_000) {
    throw new Error("Hosted track preset length is invalid.");
  }
  if (value.direction !== "clockwise" && value.direction !== "counterclockwise" && value.direction !== "unknown") {
    throw new Error("Hosted track preset direction is invalid.");
  }
  if (!nonEmpty(value.revision) || !/^\d{4}-\d{2}-\d{2}$/.test(value.revision)) {
    throw new Error("Hosted track preset revision is invalid.");
  }
  if (value.quality !== "curated" && value.quality !== "generated") {
    throw new Error("Hosted track preset quality is invalid.");
  }
  return {
    id: value.id,
    venueName: value.venueName,
    layoutName: value.layoutName,
    href: value.href,
    bbox: [west, south, east, north],
    lengthMeters: value.lengthMeters,
    direction: value.direction,
    revision: value.revision,
    quality: value.quality,
  };
}

function assertSafeHref(href: string): void {
  if (
    href.startsWith("/") ||
    href.includes("\\") ||
    href.split("/").some((part) => part === ".." || part === ".") ||
    /^[a-z][a-z\d+.-]*:/i.test(href) ||
    !/^[a-zA-Z0-9/_.-]+\.json$/.test(href)
  ) {
    throw new Error("Hosted track preset href must be a safe relative JSON path.");
  }
}

function resolveBaseUrl(baseUrl: string, path: string): string {
  const normalizedBase = `/${baseUrl.split("/").filter(Boolean).join("/")}`;
  return `${normalizedBase === "/" ? "" : normalizedBase}/${path}`;
}

function recordingBounds(points: GpsPoint[]) {
  return points.reduce((bounds, point) => ({
    west: Math.min(bounds.west, point.longitude),
    south: Math.min(bounds.south, point.latitude),
    east: Math.max(bounds.east, point.longitude),
    north: Math.max(bounds.north, point.latitude),
  }), { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity });
}

function isIsoTimestamp(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
