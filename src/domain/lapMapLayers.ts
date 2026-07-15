import type { SegmentLapRecord } from "./types";

export type LapMapLineStyle = "solid" | "dashed" | "dotted";
export type LapMapLayerRole = "focused" | "reference" | "other";

export interface LapMapLayerStyle {
  id: string;
  ordinal: number;
  role: LapMapLayerRole;
  visible: boolean;
  color: string;
  lineStyle: LapMapLineStyle;
  opacity: number;
  width: number;
}

export type LapMapLayerOverride = Partial<Pick<LapMapLayerStyle,
  "visible" | "color" | "lineStyle" | "opacity"
>>;

export type LapMapLayerOverrides = Record<string, LapMapLayerOverride>;

const OTHER_LAP_COLORS = [
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#475569",
  "#65a30d",
  "#a16207",
] as const;

export function buildLapMapLayers(
  records: SegmentLapRecord[],
  focusedLapId?: string,
  referenceLapId?: string,
  overrides: LapMapLayerOverrides = {},
): LapMapLayerStyle[] {
  let otherIndex = 0;
  return records.flatMap((record) => {
    if (record.trajectory.length < 2) return [];
    const role: LapMapLayerRole = record.lapId === focusedLapId
      ? "focused"
      : record.lapId === referenceLapId
        ? "reference"
        : "other";
    const automatic = automaticStyle(record, role, otherIndex);
    if (role === "other") otherIndex += 1;
    const override = overrides[record.lapId];
    return [{
      ...automatic,
      ...override,
      opacity: clampOpacity(override?.opacity ?? automatic.opacity),
    }];
  });
}

function automaticStyle(
  record: SegmentLapRecord,
  role: LapMapLayerRole,
  otherIndex: number,
): LapMapLayerStyle {
  if (role === "focused") {
    return {
      id: record.lapId,
      ordinal: record.ordinal,
      role,
      visible: true,
      color: "#dc2626",
      lineStyle: "solid",
      opacity: 1,
      width: 4,
    };
  }
  if (role === "reference") {
    return {
      id: record.lapId,
      ordinal: record.ordinal,
      role,
      visible: true,
      color: "#2563eb",
      lineStyle: "dashed",
      opacity: 0.9,
      width: 3.5,
    };
  }
  return {
    id: record.lapId,
    ordinal: record.ordinal,
    role,
    visible: false,
    color: OTHER_LAP_COLORS[otherIndex % OTHER_LAP_COLORS.length],
    lineStyle: otherIndex % 2 === 0 ? "dashed" : "dotted",
    opacity: 0.5 + (otherIndex % 3) * 0.06,
    width: 2.5,
  };
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.1, Math.min(1, value));
}
