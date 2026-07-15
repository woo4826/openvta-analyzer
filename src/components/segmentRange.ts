import type { TrackSection } from "../domain/types";

export function snapRangeToBoundaries(
  range: [number, number],
  sections: TrackSection[],
  totalDistanceMeters: number,
): [number, number] {
  const boundaries = [0, totalDistanceMeters, ...sections.flatMap((section) => [section.startDistanceMeters, section.endDistanceMeters])];
  const tolerance = Math.max(8, totalDistanceMeters * 0.006);
  const snap = (value: number) => {
    const nearest = boundaries.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best);
    return Math.abs(nearest - value) <= tolerance ? nearest : value;
  };
  const start = snap(range[0]);
  const end = snap(range[1]);
  return start <= end ? [start, end] : [end, start];
}
