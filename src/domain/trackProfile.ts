import type { LineString } from "geojson";
import { isCoordinate, routeDistanceMeters } from "./geometry";
import type { TrackGate, TrackProfileSource, TrackProfileV1, TrackSection } from "./types";

export interface TrackProfileParseResult {
  profile?: TrackProfileV1;
  error?: string;
}

export function parseTrackProfile(text: string): TrackProfileParseResult {
  try {
    const value = JSON.parse(text) as unknown;
    return validateTrackProfile(value);
  } catch {
    return { error: "Track profile is not valid JSON." };
  }
}

export function exportTrackProfile(profile: TrackProfileV1): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

export function validateTrackProfile(value: unknown): TrackProfileParseResult {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return { error: "Unsupported or missing track profile schemaVersion." };
  }
  if (!nonEmptyString(value.id) || !nonEmptyString(value.name)) {
    return { error: "Track profile id and name are required." };
  }
  const centerline = parseLineString(value.centerline);
  if (!centerline || centerline.coordinates.length < 2) {
    return { error: "Track profile centerline must contain at least two valid coordinates." };
  }
  if (value.direction !== "clockwise" && value.direction !== "counterclockwise" && value.direction !== "unknown") {
    return { error: "Track profile direction is invalid." };
  }
  const startFinish = value.startFinish === undefined ? undefined : parseGate(value.startFinish);
  if (value.startFinish !== undefined && !startFinish) {
    return { error: "Track profile startFinish gate is invalid." };
  }
  if (!Array.isArray(value.sectorGates)) {
    return { error: "Track profile sectorGates must be an array." };
  }
  const sectorGates = value.sectorGates.map(parseGate);
  if (sectorGates.some((gate) => !gate)) {
    return { error: "Track profile contains an invalid sector gate." };
  }
  if (!Array.isArray(value.sections)) {
    return { error: "Track profile sections must be an array." };
  }
  const centerlineLength = routeDistanceMeters(centerline.coordinates);
  const sections = value.sections.map((section) => parseSection(section, centerlineLength));
  if (sections.some((section) => !section)) {
    return { error: "Track profile contains an invalid track section." };
  }
  const source = parseSource(value.source);
  if (!source) {
    return { error: "Track profile source is invalid." };
  }
  if (!nonEmptyString(value.updatedAt) || Number.isNaN(Date.parse(value.updatedAt))) {
    return { error: "Track profile updatedAt must be an ISO timestamp." };
  }
  const pitLane = parsePitLane(value.pitLane);
  if (value.pitLane !== undefined && !pitLane) {
    return { error: "Track profile pitLane is invalid." };
  }

  return {
    profile: {
      schemaVersion: 1,
      id: value.id,
      name: value.name,
      layoutName: typeof value.layoutName === "string" && value.layoutName.trim() ? value.layoutName : undefined,
      centerline,
      direction: value.direction,
      startFinish,
      sectorGates: sectorGates as TrackGate[],
      sections: sections as TrackSection[],
      pitLane,
      source,
      updatedAt: value.updatedAt,
    },
  };
}

function parseGate(value: unknown): TrackGate | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name)) {
    return undefined;
  }
  if (value.kind !== "start-finish" && value.kind !== "sector" && value.kind !== "pit-in" && value.kind !== "pit-out") {
    return undefined;
  }
  const line = parseLineString(value.line);
  if (!line || line.coordinates.length !== 2) {
    return undefined;
  }
  if (!finiteNumber(value.forwardBearingDegrees) || !finiteNumber(value.widthMeters) || value.widthMeters < 10 || value.widthMeters > 200) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    line,
    forwardBearingDegrees: ((value.forwardBearingDegrees % 360) + 360) % 360,
    widthMeters: value.widthMeters,
  };
}

function parseSection(value: unknown, centerlineLength: number): TrackSection | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name)) {
    return undefined;
  }
  if (value.kind !== "corner-left" && value.kind !== "corner-right" && value.kind !== "straight") {
    return undefined;
  }
  if (!finiteNumber(value.startDistanceMeters) || !finiteNumber(value.endDistanceMeters)) {
    return undefined;
  }
  if (
    value.startDistanceMeters < 0 ||
    value.endDistanceMeters < 0 ||
    value.startDistanceMeters > centerlineLength ||
    value.endDistanceMeters > centerlineLength ||
    value.startDistanceMeters === value.endDistanceMeters
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    startDistanceMeters: value.startDistanceMeters,
    endDistanceMeters: value.endDistanceMeters,
  };
}

function parseSource(value: unknown): TrackProfileSource | undefined {
  if (!isRecord(value) || (value.kind !== "osm" && value.kind !== "recording" && value.kind !== "user")) {
    return undefined;
  }
  if (value.kind === "osm" && (value.license !== "ODbL-1.0" || !nonEmptyString(value.attribution))) {
    return undefined;
  }
  return {
    kind: value.kind,
    osmElementIds: Array.isArray(value.osmElementIds) ? value.osmElementIds.filter(nonEmptyString) : undefined,
    fetchedAt: nonEmptyString(value.fetchedAt) ? value.fetchedAt : undefined,
    attribution: nonEmptyString(value.attribution) ? value.attribution : undefined,
    license: value.license === "ODbL-1.0" ? value.license : undefined,
  };
}

function parsePitLane(value: unknown): TrackProfileV1["pitLane"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const line = value.line === undefined ? undefined : parseLineString(value.line);
  const inGate = value.inGate === undefined ? undefined : parseGate(value.inGate);
  const outGate = value.outGate === undefined ? undefined : parseGate(value.outGate);
  if ((value.line !== undefined && !line) || (value.inGate !== undefined && !inGate) || (value.outGate !== undefined && !outGate)) {
    return undefined;
  }
  return { line, inGate, outGate };
}

function parseLineString(value: unknown): LineString | undefined {
  if (!isRecord(value) || value.type !== "LineString" || !Array.isArray(value.coordinates)) {
    return undefined;
  }
  if (!value.coordinates.every(isCoordinate)) {
    return undefined;
  }
  return { type: "LineString", coordinates: value.coordinates };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
