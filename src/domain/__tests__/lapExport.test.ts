import { describe, expect, it } from "vitest";
import { lapAnalysisJson, lapResultsCsv, sectionResultsCsv, segmentAnalysisCsv, segmentAnalysisJson } from "../lapExport";
import type { LapResult, LapSectionResult, SegmentAnalysisResult } from "../types";

describe("lap analysis exports", () => {
  it("exports lap rows independently from existing VTA exports", () => {
    const csv = lapResultsCsv([lap()]);
    expect(csv).toContain("lapId,ordinal,completion");
    expect(csv).toContain("lap-1,1,complete,valid");
  });

  it("exports a versioned analysis bundle", () => {
    const json = lapAnalysisJson({
      sourceName: "session.Vta",
      settings: { includePartialLapSectors: false },
      laps: [lap()],
      sectors: [],
      corners: [],
    });
    expect(JSON.parse(json)).toMatchObject({ schemaVersion: 1, sourceName: "session.Vta" });
  });

  it("exports canonical automatic section analysis", () => {
    const csv = sectionResultsCsv([sectionResult()]);

    expect(csv.split("\n")[0]).toBe(
      "lapId,sectionId,name,kind,durationSeconds,deltaBestSeconds,entrySpeedKmh,minimumSpeedKmh,averageSpeedKmh,maximumSpeedKmh,exitSpeedKmh,maxLateralG,maxDecelerationG,fromPartialLap,eligibleForBest",
    );
    expect(csv).toContain("lap-1,corner-1,Corner 1,corner-right");
  });

  it("adds automatic section fields without changing the bundle version", () => {
    const result = JSON.parse(lapAnalysisJson({
      sourceName: "session.Vta",
      settings: { includePartialLapSectors: true },
      laps: [lap()],
      sectors: [],
      corners: [],
      sectionResults: [sectionResult()],
      automaticTheoreticalBestSeconds: 59.1,
    }));

    expect(result).toMatchObject({
      schemaVersion: 1,
      automaticTheoreticalBestSeconds: 59.1,
      sectionResults: [{ sectionId: "corner-1" }],
    });
  });

  it("exports the current segment scope and per-lap evidence", () => {
    const analysis = segmentAnalysis();
    const csv = segmentAnalysisCsv(analysis);
    const json = JSON.parse(segmentAnalysisJson({
      sourceName: "session.Vta",
      track: { id: "inje", name: "Inje Speedium" },
      includePartialLapSections: true,
      analysis,
    }));

    expect(csv.split("\n")[0]).toContain("coverage,durationSeconds,deltaBestSeconds,drivenDistanceMeters");
    expect(csv).toContain("lap-1,1,complete,valid,complete,8.1,0,104.2");
    expect(json).toMatchObject({
      schemaVersion: 1,
      sourceName: "session.Vta",
      track: { id: "inje" },
      includePartialLapSections: true,
      analysis: { scope: { kind: "section", sectionId: "corner-1" }, fastestLapId: "lap-1" },
    });
  });
});

function segmentAnalysis(): SegmentAnalysisResult {
  return {
    scope: { kind: "section", sectionId: "corner-1" },
    range: { startDistanceMeters: 100, endDistanceMeters: 300 },
    referenceLapId: "lap-1",
    fastestLapId: "lap-1",
    shortestLapId: "lap-1",
    records: [{
      lapId: "lap-1",
      ordinal: 1,
      completion: "complete",
      validity: "valid",
      flags: [],
      coverage: "complete",
      fromPartialLap: false,
      eligibleForBest: true,
      durationSeconds: 8.1,
      deltaBestSeconds: 0,
      drivenDistanceMeters: 104.2,
      deltaShortestMeters: 0,
      entrySpeedKmh: 120,
      minimumSpeedKmh: 72,
      averageSpeedKmh: 88,
      maximumSpeedKmh: 121,
      exitSpeedKmh: 104,
      maxLateralG: 1.2,
      maxDecelerationG: 0.9,
      peakLossRateSecondsPer100m: 0,
      gpsConfidence: "high",
      trajectory: [],
    }],
  };
}

function sectionResult(): LapSectionResult {
  return {
    id: "lap-1-corner-1",
    lapId: "lap-1",
    sectionId: "corner-1",
    name: "Corner 1",
    kind: "corner-right",
    durationSeconds: 8.1,
    deltaBestSeconds: 0,
    entrySpeedKmh: 120,
    minimumSpeedKmh: 72,
    averageSpeedKmh: 88,
    maximumSpeedKmh: 121,
    exitSpeedKmh: 104,
    maxLateralG: 1.2,
    maxDecelerationG: 0.9,
    fromPartialLap: false,
    eligibleForBest: true,
  };
}

function lap(): LapResult {
  return {
    id: "lap-1",
    ordinal: 1,
    completion: "complete",
    validity: "valid",
    flags: [],
    start: { id: "start", source: "auto", pointIndex: 0, elapsedSeconds: 0, coordinate: [0, 0] },
    end: { id: "end", source: "auto", pointIndex: 2, elapsedSeconds: 60, coordinate: [0, 0] },
    startIndex: 0,
    endIndex: 2,
    durationSeconds: 60,
    distanceKm: 3.9,
    averageSpeedKmh: 100,
    maxSpeedKmh: 150,
  };
}
