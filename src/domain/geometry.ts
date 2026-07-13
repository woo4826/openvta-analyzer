import type { LineString, Position } from "geojson";
import type { GpsPoint, TrackGate } from "./types";

const EARTH_RADIUS_METERS = 6_371_000;

export interface LocalPoint {
  x: number;
  y: number;
}

export function coordinateOf(point: Pick<GpsPoint, "longitude" | "latitude">): Position {
  return [point.longitude, point.latitude];
}

export function isCoordinate(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    Math.abs(value[1]) <= 90
  );
}

export function haversineMeters(left: Position, right: Position): number {
  const lat1 = toRadians(left[1]);
  const lat2 = toRadians(right[1]);
  const deltaLat = toRadians(right[1] - left[1]);
  const deltaLon = toRadians(right[0] - left[0]);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function routeDistanceMeters(coordinates: Position[]): number {
  let distance = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distance += haversineMeters(coordinates[index - 1], coordinates[index]);
  }
  return distance;
}

export function bearingDegrees(from: Position, to: Position): number {
  const lat1 = toRadians(from[1]);
  const lat2 = toRadians(to[1]);
  const deltaLon = toRadians(to[0] - from[0]);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

export function destinationCoordinate(origin: Position, bearing: number, distanceMeters: number): Position {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const heading = toRadians(bearing);
  const latitude = toRadians(origin[1]);
  const longitude = toRadians(origin[0]);
  const nextLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(heading),
  );
  const nextLongitude =
    longitude +
    Math.atan2(
      Math.sin(heading) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
    );
  return [normalizeLongitude(toDegrees(nextLongitude)), toDegrees(nextLatitude)];
}

export function gateLine(center: Position, forwardBearingDegrees: number, widthMeters: number): LineString {
  const halfWidth = widthMeters / 2;
  return {
    type: "LineString",
    coordinates: [
      destinationCoordinate(center, forwardBearingDegrees - 90, halfWidth),
      destinationCoordinate(center, forwardBearingDegrees + 90, halfWidth),
    ],
  };
}

export function gateCenter(gate: TrackGate): Position {
  const [left, right] = gate.line.coordinates;
  return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
}

export function toLocalMeters(coordinate: Position, origin: Position): LocalPoint {
  const latitudeRadians = toRadians(origin[1]);
  return {
    x: toRadians(coordinate[0] - origin[0]) * EARTH_RADIUS_METERS * Math.cos(latitudeRadians),
    y: toRadians(coordinate[1] - origin[1]) * EARTH_RADIUS_METERS,
  };
}

export function interpolateCoordinate(left: Position, right: Position, ratio: number): Position {
  const clamped = Math.min(1, Math.max(0, ratio));
  return [left[0] + (right[0] - left[0]) * clamped, left[1] + (right[1] - left[1]) * clamped];
}

export function pointToLineStringMeters(point: Position, line: LineString): number {
  if (!line.coordinates.length) {
    return Number.POSITIVE_INFINITY;
  }
  if (line.coordinates.length === 1) {
    return haversineMeters(point, line.coordinates[0]);
  }
  const origin = point;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.coordinates.length; index += 1) {
    const start = toLocalMeters(line.coordinates[index - 1], origin);
    const end = toLocalMeters(line.coordinates[index], origin);
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const ratio = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(start.x * deltaX + start.y * deltaY) / lengthSquared));
    minimum = Math.min(minimum, Math.hypot(start.x + deltaX * ratio, start.y + deltaY * ratio));
  }
  return minimum;
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
