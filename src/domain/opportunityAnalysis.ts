import type { LapSectionResult, TrackSection, TrackSectionKind } from "./types";

const ACTIONABLE_LOSS_SECONDS = 0.05;
const MEANINGFUL_SPEED_DEFICIT_KMH = 2;

export type OpportunityCause = "entry-speed" | "minimum-speed" | "exit-speed" | "overall-pace";
export type OpportunitySeverity = "high" | "medium" | "low";

export interface LapOpportunity {
  rank: number;
  sectionId: string;
  name: string;
  kind: TrackSectionKind;
  lostSeconds: number;
  share: number;
  cause: OpportunityCause;
  speedDeficitKmh: number;
  bestLapId: string;
  severity: OpportunitySeverity;
  fromPartialLap: boolean;
}

export interface LapOpportunitySummary {
  lapId?: string;
  potentialGainSeconds: number;
  analyzedSectionCount: number;
  opportunities: LapOpportunity[];
}

export function analyzeLapOpportunities(
  lapId: string | undefined,
  sections: TrackSection[],
  results: LapSectionResult[],
  limit = 3,
): LapOpportunitySummary {
  if (!lapId) return emptySummary(lapId);

  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const bestBySection = new Map<string, LapSectionResult>();
  for (const result of results) {
    if (!result.eligibleForBest || result.durationSeconds <= 0 || !sectionById.has(result.sectionId)) continue;
    const best = bestBySection.get(result.sectionId);
    if (!best || result.durationSeconds < best.durationSeconds) bestBySection.set(result.sectionId, result);
  }

  const selectedBySection = new Map<string, LapSectionResult>();
  for (const result of results) {
    if (result.lapId !== lapId || result.durationSeconds <= 0 || !sectionById.has(result.sectionId)) continue;
    const current = selectedBySection.get(result.sectionId);
    if (!current || result.durationSeconds < current.durationSeconds) selectedBySection.set(result.sectionId, result);
  }

  const candidates = [...selectedBySection.values()].flatMap((current) => {
    const best = bestBySection.get(current.sectionId);
    const section = sectionById.get(current.sectionId);
    if (!best || !section) return [];
    const lostSeconds = current.durationSeconds - best.durationSeconds;
    if (!Number.isFinite(lostSeconds) || lostSeconds < ACTIONABLE_LOSS_SECONDS) return [];
    const evidence = classifyCause(current, best);
    return [{
      rank: 0,
      sectionId: section.id,
      name: section.name,
      kind: section.kind,
      lostSeconds,
      share: 0,
      cause: evidence.cause,
      speedDeficitKmh: evidence.speedDeficitKmh,
      bestLapId: best.lapId,
      severity: "low" as OpportunitySeverity,
      fromPartialLap: current.fromPartialLap,
    }];
  }).sort((left, right) => right.lostSeconds - left.lostSeconds || left.name.localeCompare(right.name));

  const potentialGainSeconds = candidates.reduce((sum, opportunity) => sum + opportunity.lostSeconds, 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 3;
  const largestLoss = candidates[0]?.lostSeconds ?? 0;
  const opportunities = candidates.slice(0, safeLimit).map((opportunity, index) => ({
    ...opportunity,
    rank: index + 1,
    share: potentialGainSeconds > 0 ? opportunity.lostSeconds / potentialGainSeconds : 0,
    severity: severityFor(opportunity.lostSeconds, largestLoss),
  }));

  return {
    lapId,
    potentialGainSeconds,
    analyzedSectionCount: [...selectedBySection.keys()].filter((sectionId) => bestBySection.has(sectionId)).length,
    opportunities,
  };
}

function classifyCause(
  current: LapSectionResult,
  best: LapSectionResult,
): { cause: OpportunityCause; speedDeficitKmh: number } {
  const evidence: Array<{ cause: OpportunityCause; deficit: number }> = [
    { cause: "entry-speed", deficit: best.entrySpeedKmh - current.entrySpeedKmh },
    { cause: "minimum-speed", deficit: best.minimumSpeedKmh - current.minimumSpeedKmh },
    { cause: "exit-speed", deficit: best.exitSpeedKmh - current.exitSpeedKmh },
  ];
  const strongest = evidence.reduce((left, right) => right.deficit > left.deficit ? right : left);
  return strongest.deficit >= MEANINGFUL_SPEED_DEFICIT_KMH
    ? { cause: strongest.cause, speedDeficitKmh: strongest.deficit }
    : { cause: "overall-pace", speedDeficitKmh: Math.max(0, strongest.deficit) };
}

function severityFor(lostSeconds: number, largestLoss: number): OpportunitySeverity {
  if (largestLoss <= 0) return "low";
  const ratio = lostSeconds / largestLoss;
  if (ratio >= 0.67) return "high";
  if (ratio >= 0.34) return "medium";
  return "low";
}

function emptySummary(lapId: string | undefined): LapOpportunitySummary {
  return { lapId, potentialGainSeconds: 0, analyzedSectionCount: 0, opportunities: [] };
}
