import type { LineString, Position } from "geojson";
import {
  bearingDegrees,
  gateLine,
  haversineMeters,
  pointToLineStringMeters,
  routeDistanceMeters,
} from "./geometry";
import type { GpsPoint, TrackGate, TrackProfileV1 } from "./types";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
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
  isPitLane: boolean;
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
      const payload: unknown = await response.json();
      if (!isOverpassPayload(payload)) {
        throw new Error("Overpass returned a malformed payload.");
      }
      const candidates = parseOsmTrackCandidates(payload, points);
      const plausible = candidates.filter(
        (candidate) => candidate.medianDistanceMeters <= 80 && candidate.lengthRatio >= 0.65 && candidate.lengthRatio <= 1.35,
      );
      if (!plausible.length) {
        return { status: "no-match", candidates: [], endpoint };
      }
      const best = plausible[0];
      const ambiguous = plausible.length > 1 && plausible[1].score <= best.score * 1.18;
      return { status: ambiguous ? "ambiguous" : "matched", candidates: plausible, endpoint };
    } catch {
      // Try one fallback endpoint before returning the offline state.
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
  return {
    status: "offline",
    candidates: [],
    message: "OpenStreetMap lookup is unavailable. Continue with a manual gate or imported track.",
  };
}

export function buildOverpassQuery(points: GpsPoint[], paddingMeters = 750): string {
  const bounds = expandedBounds(points, paddingMeters);
  const bbox = `${bounds.south.toFixed(7)},${bounds.west.toFixed(7)},${bounds.north.toFixed(7)},${bounds.east.toFixed(7)}`;
  return `[out:json][timeout:15];(way(${bbox})["highway"="raceway"];node(${bbox})["raceway"~"^(start|finish|start-finish)$"];);out tags geom;`;
}

export function parseOsmTrackCandidates(value: unknown, recording: GpsPoint[]): OsmTrackCandidate[] {
  if (!isRecord(value) || !Array.isArray(value.elements)) return [];
  const elements = value.elements.filter(isRecord) as OverpassElement[];
  const ways = elements.flatMap(parseRacewayWay);
  const merged = mergeConnectedWays(ways.filter((way) => !way.isPitLane));
  const pitLanes = mergeConnectedWays(ways.filter((way) => way.isPitLane));
  const startCoordinates = elements.flatMap(parseStartCoordinate);
  const recordingDistance = routeDistanceMeters(recording.map((point) => [point.longitude, point.latitude]));
  const candidates = merged
    .map((wayGroup) => {
      const orientation = orientCenterlineFromRecording(wayGroup.coordinates, recording);
      const centerline: LineString = { type: "LineString", coordinates: orientation.coordinates };
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
        direction: orientation.direction,
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

  if (!candidates.length || !pitLanes.length) return candidates;
  const nearestPitLane = [...pitLanes].sort((left, right) =>
    distanceBetweenLines(left.coordinates, candidates[0].profile.centerline.coordinates) -
    distanceBetweenLines(right.coordinates, candidates[0].profile.centerline.coordinates)
  )[0];
  const primary = candidates[0];
  candidates[0] = {
    ...primary,
    profile: {
      ...primary.profile,
      pitLane: { line: { type: "LineString", coordinates: nearestPitLane.coordinates } },
      source: {
        ...primary.profile.source,
        osmElementIds: [
          ...(primary.profile.source.osmElementIds ?? []),
          ...nearestPitLane.ids.map((id) => `way/${id}`),
        ],
      },
    },
  };
  return candidates;
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
  const name = typeof tags.name === "string" ? tags.name : "";
  return [{
    id: String(element.id),
    name,
    coordinates,
    isPitLane: tags.raceway === "pit_lane" || isPitLaneName(name),
  }];
}

function parseStartCoordinate(element: OverpassElement): Position[] {
  if (element.type !== "node" || !finiteNumber(element.lon) || !finiteNumber(element.lat)) return [];
  const tags = isRecord(element.tags) ? element.tags : {};
  const tag = tags.raceway;
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

function orientCenterlineFromRecording(
  coordinates: Position[],
  recording: GpsPoint[],
): { coordinates: Position[]; direction: TrackProfileV1["direction"] } {
  let alignment = 0;
  let evidence = 0;
  const sampleStep = Math.max(1, Math.floor(recording.length / 250));
  for (let index = 1; index < recording.length; index += sampleStep) {
    const previous = recording[index - 1];
    const current = recording[index];
    const recordingStart: Position = [previous.longitude, previous.latitude];
    const recordingEnd: Position = [current.longitude, current.latitude];
    if (haversineMeters(recordingStart, recordingEnd) < 1) continue;
    const midpoint: Position = [
      (recordingStart[0] + recordingEnd[0]) / 2,
      (recordingStart[1] + recordingEnd[1]) / 2,
    ];
    const segment = nearestSegment(coordinates, midpoint);
    if (!segment) continue;
    const delta = shortestBearingDelta(
      bearingDegrees(recordingStart, recordingEnd),
      bearingDegrees(segment[0], segment[1]),
    );
    alignment += Math.cos((delta * Math.PI) / 180);
    evidence += 1;
  }

  const oriented = alignment < 0 ? [...coordinates].reverse() : [...coordinates];
  return {
    coordinates: oriented,
    direction: evidence > 0 && Math.abs(alignment) / evidence >= 0.25
      ? loopDirection(oriented)
      : "unknown",
  };
}

function nearestSegment(coordinates: Position[], point: Position): [Position, Position] | undefined {
  let nearest: [Position, Position] | undefined;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    const segment: LineString = { type: "LineString", coordinates: [coordinates[index - 1], coordinates[index]] };
    const distance = pointToLineStringMeters(point, segment);
    if (distance < minimum) {
      minimum = distance;
      nearest = [coordinates[index - 1], coordinates[index]];
    }
  }
  return nearest;
}

function loopDirection(coordinates: Position[]): TrackProfileV1["direction"] {
  if (coordinates.length < 4) return "unknown";
  const length = routeDistanceMeters(coordinates);
  if (haversineMeters(coordinates[0], coordinates.at(-1)!) > Math.max(30, length * 0.02)) return "unknown";
  let signedArea = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    signedArea += previous[0] * current[1] - current[0] * previous[1];
  }
  if (Math.abs(signedArea) < 1e-12) return "unknown";
  return signedArea > 0 ? "counterclockwise" : "clockwise";
}

function shortestBearingDelta(left: number, right: number): number {
  return ((left - right + 540) % 360) - 180;
}

function distanceBetweenLines(left: Position[], right: Position[]): number {
  const line: LineString = { type: "LineString", coordinates: right };
  return Math.min(...left.map((coordinate) => pointToLineStringMeters(coordinate, line)));
}

function isPitLaneName(name: string): boolean {
  return /(?:\bpit(?:\s*lane)?\b|피트|ピット|維修|维修|voie\s+des\s+stands|boxengasse|corsia\s+dei\s+box|calle\s+de\s+boxes)/iu.test(name);
}

function endpointsTouch(left: Position, right: Position): boolean {
  return Math.abs(left[0] - right[0]) < 1e-7 && Math.abs(left[1] - right[1]) < 1e-7;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOverpassPayload(value: unknown): value is { elements: unknown[] } {
  return isRecord(value) && Array.isArray(value.elements);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
