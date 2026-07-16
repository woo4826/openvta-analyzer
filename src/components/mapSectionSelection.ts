import type { LineString, Position } from "geojson";
import {
  isCoordinate,
  projectCoordinateToLineProgress,
  routeDistanceMeters,
} from "../domain/geometry";
import type { TrackSection } from "../domain/types";

const DISTANCE_EPSILON_METERS = 0.001;

export interface MapSectionSelection {
  sectionId: string;
  distanceMeters: number;
  offsetMeters?: number;
  coordinate?: Position;
}

export function resolveMapSectionSelection(
  coordinate: Position,
  centerline: LineString,
  sections: TrackSection[],
): MapSectionSelection | undefined {
  if (!isCoordinate(coordinate) || centerline.coordinates.length < 2 || !sections.length) {
    return undefined;
  }

  const projection = projectCoordinateToLineProgress(coordinate, centerline);
  const lineLengthMeters = routeDistanceMeters(centerline.coordinates);
  if (
    !Number.isFinite(projection.distanceMeters)
    || !Number.isFinite(projection.offsetMeters)
    || !Number.isFinite(lineLengthMeters)
  ) {
    return undefined;
  }

  const distanceMeters = Math.min(lineLengthMeters, Math.max(0, projection.distanceMeters));
  const section = resolveSectionAtDistance(distanceMeters, sections);
  return section
    ? {
        sectionId: section.id,
        distanceMeters,
        offsetMeters: projection.offsetMeters,
        coordinate: [...coordinate],
      }
    : undefined;
}

export function resolveSectionAtDistance(
  distanceMeters: number,
  sections: TrackSection[],
): TrackSection | undefined {
  if (!Number.isFinite(distanceMeters)) return undefined;
  const validSections = sections.filter(hasFiniteRange);
  if (!validSections.length) return undefined;

  const exactStart = validSections.find((section) => (
    Math.abs(distanceMeters - rangeStart(section)) <= DISTANCE_EPSILON_METERS
  ));
  if (exactStart) return exactStart;

  const containing = validSections.find((section) => (
    distanceMeters >= rangeStart(section) && distanceMeters < rangeEnd(section)
  ));
  if (containing) return containing;

  return validSections.reduce((closest, section) => (
    distanceToRange(distanceMeters, section) < distanceToRange(distanceMeters, closest)
      ? section
      : closest
  ));
}

export function sectionMidpointSelection(section: TrackSection): MapSectionSelection {
  return {
    sectionId: section.id,
    distanceMeters: (rangeStart(section) + rangeEnd(section)) / 2,
  };
}

function hasFiniteRange(section: TrackSection): boolean {
  return Number.isFinite(section.startDistanceMeters) && Number.isFinite(section.endDistanceMeters);
}

function rangeStart(section: TrackSection): number {
  return Math.min(section.startDistanceMeters, section.endDistanceMeters);
}

function rangeEnd(section: TrackSection): number {
  return Math.max(section.startDistanceMeters, section.endDistanceMeters);
}

function distanceToRange(distanceMeters: number, section: TrackSection): number {
  const start = rangeStart(section);
  const end = rangeEnd(section);
  if (distanceMeters < start) return start - distanceMeters;
  if (distanceMeters > end) return distanceMeters - end;
  return 0;
}
