import { describe, expect, it } from "vitest";
import { generateAutomaticSections, validateSectionPartition } from "../automaticSections";
import type { LapDistanceSample } from "../types";

describe("automatic track sections", () => {
  it("returns a complete non-overlapping partition with stable ids", () => {
    const samples = shapedSamples();
    const result = generateAutomaticSections(samples);

    expect(result[0]?.startDistanceMeters).toBe(0);
    expect(result.at(-1)?.endDistanceMeters).toBe(samples.at(-1)?.distanceMeters);
    expect(validateSectionPartition(result, samples.at(-1)!.distanceMeters)).toBe(true);
    expect(result.map((section) => section.kind)).toEqual(
      expect.arrayContaining(["straight", "corner-left", "corner-right"]),
    );
    expect(result.every((section) => section.source === "automatic")).toBe(true);
    expect(generateAutomaticSections(samples).map((section) => section.id))
      .toEqual(result.map((section) => section.id));
  });

  it("splits a straight longer than five hundred metres", () => {
    const sections = generateAutomaticSections(straightSamples(1_200));

    expect(sections).toHaveLength(3);
    expect(sections.every((section) => section.kind === "straight")).toBe(true);
    expect(validateSectionPartition(sections, 1_200)).toBe(true);
  });

  it("does not emit noise islands shorter than twenty metres", () => {
    const samples = straightSamples(200);
    samples[10] = { ...samples[10], latitude: samples[10].latitude + 0.00008 };

    const sections = generateAutomaticSections(samples);

    expect(sections.every((section) => section.endDistanceMeters - section.startDistanceMeters >= 20)).toBe(true);
  });
});

function straightSamples(totalMeters: number): LapDistanceSample[] {
  return Array.from({ length: Math.floor(totalMeters / 5) + 1 }, (_, index) => {
    const distanceMeters = Math.min(totalMeters, index * 5);
    return sample(distanceMeters, distanceMeters / 111_195, 0, 120);
  });
}

function shapedSamples(): LapDistanceSample[] {
  const coordinates: Array<[number, number, number]> = [];
  const append = (longitude: number, latitude: number, speed: number) => {
    coordinates.push([longitude, latitude, speed]);
  };

  for (let index = 0; index < 30; index += 1) append(index * 0.000045, 0, 120);
  const leftCenter: [number, number] = [0.00135, 0.00045];
  for (let index = 0; index <= 18; index += 1) {
    const angle = (-90 + index * 5) * Math.PI / 180;
    append(leftCenter[0] + Math.cos(angle) * 0.00045, leftCenter[1] + Math.sin(angle) * 0.00045, 70);
  }
  for (let index = 1; index < 25; index += 1) append(0.0018 - index * 0.000045, 0.00045, 110);
  const rightCenter: [number, number] = [0.000675, 0.0009];
  for (let index = 0; index <= 18; index += 1) {
    const angle = (-90 - index * 5) * Math.PI / 180;
    append(rightCenter[0] + Math.cos(angle) * 0.00045, rightCenter[1] + Math.sin(angle) * 0.00045, 65);
  }
  for (let index = 1; index < 30; index += 1) append(0.000225 + index * 0.000045, 0.0009, 120);

  return coordinates.map(([longitude, latitude, speedKmh], index) =>
    sample(index * 5, longitude, latitude, speedKmh));
}

function sample(
  distanceMeters: number,
  longitude: number,
  latitude: number,
  speedKmh: number,
): LapDistanceSample {
  return {
    distanceMeters,
    elapsedSeconds: distanceMeters / Math.max(1, speedKmh / 3.6),
    speedKmh,
    longitude,
    latitude,
    sourceIndex: Math.round(distanceMeters / 5),
  };
}
