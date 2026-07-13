import { describe, expect, it } from "vitest";
import { lapAnalysisJson, lapResultsCsv } from "../lapExport";
import type { LapResult } from "../types";

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
});

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
