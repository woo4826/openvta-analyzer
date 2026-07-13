import type { LineString, Position } from "geojson";
import {
  bearingDegrees,
  gateLine,
  pointToLineStringMeters,
  routeDistanceMeters,
} from "./geometry";
import type { GpsPoint, TrackGate, TrackProfileV1 } from "./types";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

export type OsmLookupStatus = "matched" | "ambiguous" | "no-match" | "offline" | "invalid-route";

export interface OsmTrackCandidate {
  profile: TrackProfileV1;
  medianDistanceMeters: number;
  lengthRatio: number;
  score: number;
}

export interface OsmLookupResult {
  status: OsmLookupStatus;
  candidates: OsmTrackCandidate[];
  endpoint?: string;
  message?: string;
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  tags?: unknown;
  geometry?: unknown;
}

interface RacewayWay {
  id: string;
  name: string;
  coordinates: Position[];
}

export async function lookupOsmTracks(
  points: GpsPoint[],
  fetchImpl: typeof fetch = fetch,
  endpoints: readonly string[] = OVERPASS_ENDPOINTS,
): Promise<OsmLookupResult> {
  if (points.length < 2) {
    return { status: "invalid-route", candidates: [], message: "At least two GPS points are required." };
  }
  const query = buildOverpassQuery(points);
  let lastError: unknown;
  for (const endpoint of endpoints.slice(0, 2)) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Overpass responded with ${response.status}.`);
      const candidates = parseOsmTrackCandidates(await response.json(), points);
      const plausible = candidates.filter(
        (candidate) => candidate.medianDistanceMeters <= 80 && candidate.lengthRatio >= 0.65 && candidate.lengthRatio <= 1.35,
      );
      if (!plausible.length) {
        return { status: "no-match", candidates: [], endpoint };
      }
      const best = plausible[0];
      const ambiguous = plausible.length > 1 && plausible[1].score <= best.score * 1.18;
      return { status: ambiguous ? "ambiguous" : "matched", candidates: plausible, endpoint };
    } catch (error) {
      lastError = error;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
  return {
    status: "offline",
    candidates: [],
    message: lastError instanceof Error ? lastError.message : "OpenStreetMap track lookup failed.",
  };
}

export function buildOverpassQuery(points: GpsPoint[], paddingMeters = 750): string {
  const bounds = expandedBounds(points, paddingMeters);
  const bbox = `${bounds.south.toFixed(7)},${bounds.west.toFixed(7)},${bounds.north.toFixed(7)},${bounds.east.toFixed(7)}`;
  return `[out:json][timeout:15];(way(${bbox})["highway"="raceway"];node(${bbox})["raceway"~"^(start|finish|start-finish)$"];node(${bbox})["motorport"~"^(start|finish|start-finish)$"];);out tags geom;`;
}

export function parseOsmTrackCandidates(value: unknown, recording: GpsPoint[]): OsmTrackCandidate[] {
  if (!isRecord(value) || !Array.isArray(value.elements)) return [];
  const elements = value.elements.filter(isRecord) as OverpassElement[];
  const ways = elements.flatMap(parseRacewayWay);
  const merged = mergeConnectedWays(ways);
  const startCoordinates = elements.flatMap(parseStartCoordinate);
  const recordingDistance = routeDistanceMeters(recording.map((point) => [point.longitude, point.latitude]));
  return merged
    .map((wayGroup) => {
      const centerline: LineString = { type: "LineString", coordinates: wayGroup.coordinates };
      const length = routeDistanceMeters(centerline.coordinates);
      if (length < 150) return undefined;
      const estimatedLaps = Math.max(1, Math.round(recordingDistance / Math.max(1, length)));
      const estimatedLapLength = recordingDistance / estimatedLaps;
      const lengthRatio = estimatedLapLength / length;
      const sampleStep = Math.max(1, Math.floor(recording.length / 250));
      const distances = recording
        .filter((_, index) => index % sampleStep === 0)
        .map((point) => pointToLineStringMeters([point.longitude, point.latitude], centerline))
        .sort((left, right) => left - right);
      const medianDistanceMeters = distances[Math.floor(distances.length / 2)] ?? Number.POSITIVE_INFINITY;
      const ids = wayGroup.ids;
      const startFinish = startCoordinates.length
        ? gateAtNearestCenterlinePoint(centerline, startCoordinates[0])
        : undefined;
      const updatedAt = new Date().toISOString();
      const profile: TrackProfileV1 = {
        schemaVersion: 1,
        id: `osm-${ids.join("-")}`,
        name: wayGroup.name || "OpenStreetMap raceway",
        centerline,
        direction: "unknown",
        startFinish,
        sectorGates: [],
        sections: [],
        source: {
          kind: "osm",
          osmElementIds: ids.map((id) => `way/${id}`),
          fetchedAt: updatedAt,
          attribution: "© OpenStreetMap contributors",
          license: "ODbL-1.0",
        },
        updatedAt,
      };
      return {
        profile,
        medianDistanceMeters,
        lengthRatio,
        score: medianDistanceMeters + Math.abs(1 - lengthRatio) * 120,
      } satisfies OsmTrackCandidate;
    })
    .filter((candidate): candidate is OsmTrackCandidate => Boolean(candidate))
    .sort((left, right) => left.score - right.score);
}

export function scoreTrackProfile(profile: TrackProfileV1, recording: GpsPoint[]): OsmTrackCandidate {
  return parseOsmTrackCandidates(
    {
      elements: [{
        type: "way",
        id: profile.id,
        tags: { highway: "raceway", name: profile.name },
        geometry: profile.centerline.coordinates.map((coordinate) => ({ lon: coordinate[0], lat: coordinate[1] })),
      }],
    },
    recording,
  )[0] ?? { profile, medianDistanceMeters: Number.POSITIVE_INFINITY, lengthRatio: 0, score: Number.POSITIVE_INFINITY };
}

function expandedBounds(points: GpsPoint[], paddingMeters: number) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const centerLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const latitudePadding = paddingMeters / 111_320;
  const longitudePadding = paddingMeters / Math.max(1, 111_320 * Math.cos((centerLatitude * Math.PI) / 180));
  return {
    south: Math.min(...latitudes) - latitudePadding,
    west: Math.min(...longitudes) - longitudePadding,
    north: Math.max(...latitudes) + latitudePadding,
    east: Math.max(...longitudes) + longitudePadding,
  };
}

function parseRacewayWay(element: OverpassElement): RacewayWay[] {
  if (element.type !== "way" || !(typeof element.id === "number" || typeof element.id === "string")) return [];
  const tags = isRecord(element.tags) ? element.tags : {};
  if (tags.highway !== "raceway" || !Array.isArray(element.geometry)) return [];
  const coordinates = element.geometry.flatMap((coordinate) => {
    if (!isRecord(coordinate) || !finiteNumber(coordinate.lon) || !finiteNumber(coordinate.lat)) return [];
    return [[coordinate.lon, coordinate.lat] satisfies Position];
  });
  if (coordinates.length < 2) return [];
  return [{ id: String(element.id), name: typeof tags.name === "string" ? tags.name : "", coordinates }];
}

function parseStartCoordinate(element: OverpassElement): Position[] {
  if (element.type !== "node" || !finiteNumber(element.lon) || !finiteNumber(element.lat)) return [];
  const tags = isRecord(element.tags) ? element.tags : {};
  const tag = tags.raceway ?? tags.motorport;
  return tag === "start" || tag === "finish" || tag === "start-finish" ? [[element.lon, element.lat]] : [];
}

function mergeConnectedWays(ways: RacewayWay[]): Array<{ ids: string[]; name: string; coordinates: Position[] }> {
  const remaining = ways.map((way) => ({ ids: [way.id], name: way.name, coordinates: [...way.coordinates] }));
  const merged: typeof remaining = [];
  while (remaining.length) {
    const current = remaining.shift()!;
    let didMerge = true;
    while (didMerge) {
      didMerge = false;
      const start = current.coordinates[0];
      const end = current.coordinates.at(-1)!;
      const index = remaining.findIndex((candidate) =>
        endpointsTouch(end, candidate.coordinates[0]) ||
        endpointsTouch(end, candidate.coordinates.at(-1)!) ||
        endpointsTouch(start, candidate.coordinates.at(-1)!) ||
        endpointsTouch(start, candidate.coordinates[0]),
      );
      if (index === -1) continue;
      const candidate = remaining.splice(index, 1)[0];
      current.ids.push(...candidate.ids);
      current.name ||= candidate.name;
      if (endpointsTouch(end, candidate.coordinates[0])) current.coordinates.push(...candidate.coordinates.slice(1));
      else if (endpointsTouch(end, candidate.coordinates.at(-1)!)) current.coordinates.push(...candidate.coordinates.slice(0, -1).reverse());
      else if (endpointsTouch(start, candidate.coordinates.at(-1)!)) current.coordinates.unshift(...candidate.coordinates.slice(0, -1));
      else current.coordinates.unshift(...candidate.coordinates.slice(1).reverse());
      didMerge = true;
    }
    merged.push(current);
  }
  return merged;
}

function gateAtNearestCenterlinePoint(centerline: LineString, coordinate: Position): TrackGate | undefined {
  let index = 0;
  let minimum = Number.POSITIVE_INFINITY;
  centerline.coordinates.forEach((candidate, candidateIndex) => {
    const distance = pointToLineStringMeters(coordinate, { type: "LineString", coordinates: [candidate] });
    if (distance < minimum) {
      minimum = distance;
      index = candidateIndex;
    }
  });
  const previous = centerline.coordinates[Math.max(0, index - 1)];
  const next = centerline.coordinates[Math.min(centerline.coordinates.length - 1, index + 1)];
  if (!previous || !next || index === 0 && index === centerline.coordinates.length - 1) return undefined;
  const forwardBearingDegrees = bearingDegrees(previous, next);
  return {
    id: "start-finish",
    name: "Start / Finish",
    kind: "start-finish",
    line: gateLine(centerline.coordinates[index], forwardBearingDegrees, 50),
    forwardBearingDegrees,
    widthMeters: 50,
  };
}

function endpointsTouch(left: Position, right: Position): boolean {
  return Math.abs(left[0] - right[0]) < 1e-7 && Math.abs(left[1] - right[1]) < 1e-7;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
