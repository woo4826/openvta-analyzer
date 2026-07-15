import type { SegmentLapRecord } from "../domain/types";
import { useI18n } from "../i18n/useI18n";

interface SegmentLapTableProps {
  records: SegmentLapRecord[];
  focusedLapId?: string;
  referenceLapId?: string;
  fastestLapId?: string;
  shortestLapId?: string;
  onFocusedLap: (lapId: string) => void;
  onReferenceLap: (lapId: string) => void;
}

export function SegmentLapTable({
  records,
  focusedLapId,
  referenceLapId,
  fastestLapId,
  shortestLapId,
  onFocusedLap,
  onReferenceLap,
}: SegmentLapTableProps) {
  const { t } = useI18n();
  return (
    <div className="table-wrap segment-lap-table-wrap">
      <table className="segment-lap-table">
        <thead>
          <tr>
            <th>{t("lap.lap")}</th>
            <th>{t("lap.completion")}</th>
            <th>{t("lap.duration")}</th>
            <th>{t("lap.deltaBest")}</th>
            <th>{t("lap.workbench.path")}</th>
            <th>{t("lap.entrySpeed")}</th>
            <th>{t("lap.minimumSpeed")}</th>
            <th>{t("lap.exitSpeed")}</th>
            <th>{t("lap.workbench.lossRate")}</th>
            <th>{t("lap.workbench.gps")}</th>
            <th>{t("lap.reference")}</th>
          </tr>
        </thead>
        <tbody>
          {[...records].sort((left, right) => left.ordinal - right.ordinal).map((record) => (
            <tr key={record.lapId} className={record.lapId === focusedLapId ? "is-focused" : undefined}>
              <th scope="row">
                <button type="button" className="lap-focus-button" aria-label={`${t("lap.workbench.focus")} ${recordLapLabel(record, t)}`} onClick={() => onFocusedLap(record.lapId)}>
                  {recordLapLabel(record, t)}
                </button>
                <div className="record-badges">
                  {record.lapId === fastestLapId ? <span>{t("lap.workbench.fastestPath")}</span> : null}
                  {record.lapId === shortestLapId ? <span>{t("lap.workbench.shortestPath")}</span> : null}
                </div>
              </th>
              <td>{recordStatus(record, t)}</td>
              <td>{formatTime(record.durationSeconds)}</td>
              <td className={deltaTone(record.deltaBestSeconds)}>{formatDelta(record.deltaBestSeconds)}</td>
              <td>{formatMeters(record.drivenDistanceMeters, record.deltaShortestMeters)}</td>
              <td>{formatSpeed(record.entrySpeedKmh)}</td>
              <td>{formatSpeed(record.minimumSpeedKmh)}</td>
              <td>{formatSpeed(record.exitSpeedKmh)}</td>
              <td>{record.peakLossRateSecondsPer100m === undefined ? "—" : `+${record.peakLossRateSecondsPer100m.toFixed(2)} s/100m`}</td>
              <td><span className={`gps-confidence ${record.gpsConfidence}`}>{gpsConfidenceLabel(record.gpsConfidence, t)}</span></td>
              <td>
                <input
                  type="radio"
                  name="segment-reference-lap"
                  aria-label={`${t("lap.reference")} ${recordLapLabel(record, t)}`}
                  checked={record.lapId === referenceLapId}
                  disabled={record.completion !== "complete" || !record.eligibleForBest}
                  onChange={() => onReferenceLap(record.lapId)}
                />
                <details className="segment-row-details">
                  <summary>{t("lap.workbench.details")}</summary>
                  <dl>
                    <div><dt>{t("lap.avgSpeed")}</dt><dd>{formatSpeed(record.averageSpeedKmh)}</dd></div>
                    <div><dt>{t("lap.maxLateralG")}</dt><dd>{record.maxLateralG === undefined ? "—" : `${record.maxLateralG.toFixed(2)} g`}</dd></div>
                    <div><dt>{t("lap.maxDecelerationG")}</dt><dd>{record.maxDecelerationG === undefined ? "—" : `${record.maxDecelerationG.toFixed(2)} g`}</dd></div>
                    <div><dt>{t("lap.workbench.bestEligible")}</dt><dd>{record.eligibleForBest ? t("lap.yes") : t("lap.no")}</dd></div>
                  </dl>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type T = ReturnType<typeof useI18n>["t"];

function recordStatus(record: SegmentLapRecord, t: T): string {
  if (record.completion === "complete") {
    if (record.flags.includes("gps-gap")) return `${t("lap.complete")} · ${t("lap.workbench.gpsGap")}`;
    return record.validity === "valid" ? t("lap.complete") : `${t("lap.complete")} · ${t(`lap.${record.validity}`)}`;
  }
  const fragment = record.completion === "partial-start"
    ? t("lap.workbench.openingFragment")
    : record.completion === "partial-end"
      ? t("lap.workbench.closingFragment")
      : t("lap.workbench.incompleteRecording");
  if (record.flags.includes("gps-gap")) return `${fragment} · ${t("lap.workbench.gpsGap")}`;
  return record.coverage === "complete" ? fragment : `${fragment} · ${t("lap.workbench.noCoverage").toLowerCase()}`;
}

function recordLapLabel(record: SegmentLapRecord, t: T): string {
  if (record.completion === "partial-start") return t("lap.workbench.openingFragment");
  if (record.completion === "partial-end") return t("lap.workbench.closingFragment");
  if (record.completion === "partial-both") return t("lap.workbench.incompleteRecording");
  return `${t("lap.lap")} ${record.ordinal}`;
}

function gpsConfidenceLabel(confidence: SegmentLapRecord["gpsConfidence"], t: T): string {
  const keys = {
    high: "lap.workbench.gpsHigh",
    medium: "lap.workbench.gpsMedium",
    low: "lap.workbench.gpsLow",
    unknown: "lap.workbench.gpsUnknown",
  } as const;
  return t(keys[confidence]);
}

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

function formatDelta(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  const normalized = Math.abs(seconds) < 0.0005 ? 0 : seconds;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(3)} s`;
}

function formatMeters(distance: number | undefined, delta: number | undefined): string {
  if (distance === undefined) return "—";
  return `${distance.toFixed(1)} m${delta === undefined ? "" : ` (${delta > 0 ? "+" : ""}${delta.toFixed(1)} m)`}`;
}

function formatSpeed(speed: number | undefined): string {
  return speed === undefined ? "—" : `${speed.toFixed(1)} km/h`;
}

function deltaTone(delta: number | undefined): string | undefined {
  if (delta === undefined) return undefined;
  return delta > 0.001 ? "delta-loss" : "delta-best";
}
