import type {
  SegmentLapVisibility,
  SegmentTelemetryLayout,
  SegmentWidgetId,
  SegmentWidgetLayout,
  SegmentWorkbenchPreferences,
} from "./types";

type JsonStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const SEGMENT_WORKBENCH_STORAGE_KEY = "openvta.segmentWorkbench.v2";

export const SEGMENT_WIDGET_IDS: SegmentWidgetId[] = [
  "map",
  "evidence",
  "variation",
  "telemetry",
  "laps",
];

const lapVisibilities: SegmentLapVisibility[] = ["all", "focus-reference", "focus-only"];
const telemetryLayouts: SegmentTelemetryLayout[] = ["three-column", "two-plus-one", "three-stacked"];

const defaultLayouts: Record<string, SegmentWidgetLayout[]> = {
  lg: [
    { i: "map", x: 0, y: 0, w: 12, h: 11, minW: 6, minH: 8 },
    { i: "telemetry", x: 0, y: 11, w: 12, h: 11, minW: 6, minH: 11 },
    { i: "evidence", x: 0, y: 22, w: 4, h: 7, minW: 3, minH: 5 },
    { i: "variation", x: 4, y: 22, w: 8, h: 7, minW: 4, minH: 5 },
    { i: "laps", x: 0, y: 29, w: 12, h: 7, minW: 5, minH: 5 },
  ],
  md: [
    { i: "map", x: 0, y: 0, w: 8, h: 10, minW: 4, minH: 8 },
    { i: "telemetry", x: 0, y: 10, w: 8, h: 11, minW: 4, minH: 11 },
    { i: "evidence", x: 0, y: 21, w: 3, h: 7, minW: 3, minH: 5 },
    { i: "variation", x: 3, y: 21, w: 5, h: 7, minW: 3, minH: 5 },
    { i: "laps", x: 0, y: 28, w: 8, h: 8, minW: 4, minH: 5 },
  ],
  sm: compactLayout(),
  xs: compactLayout(),
};

export function defaultSegmentWorkbenchPreferences(): SegmentWorkbenchPreferences {
  return {
    version: 2,
    drawerOpen: false,
    lapVisibility: "focus-reference",
    telemetryLayout: "three-column",
    snapToSections: true,
    visibleWidgets: Object.fromEntries(SEGMENT_WIDGET_IDS.map((id) => [id, true])) as Record<SegmentWidgetId, boolean>,
    layouts: cloneLayouts(defaultLayouts),
  };
}

export function loadSegmentWorkbenchPreferences(
  storage: JsonStorage = defaultStorage(),
): SegmentWorkbenchPreferences {
  const defaults = defaultSegmentWorkbenchPreferences();
  try {
    const raw = storage.getItem(SEGMENT_WORKBENCH_STORAGE_KEY);
    if (raw === null) return defaults;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)
      || value.version !== 2
      || typeof value.drawerOpen !== "boolean"
      || !lapVisibilities.includes(value.lapVisibility as SegmentLapVisibility)
      || typeof value.snapToSections !== "boolean"
      || !isVisibleWidgetRecord(value.visibleWidgets)
      || !isLayoutRecord(value.layouts)) {
      return defaults;
    }
    return {
      version: 2,
      drawerOpen: value.drawerOpen,
      lapVisibility: value.lapVisibility as SegmentLapVisibility,
      telemetryLayout: telemetryLayouts.includes(value.telemetryLayout as SegmentTelemetryLayout)
        ? value.telemetryLayout as SegmentTelemetryLayout
        : defaults.telemetryLayout,
      snapToSections: value.snapToSections,
      visibleWidgets: normalizeVisibleWidgets(value.visibleWidgets),
      layouts: mergeSegmentLayouts(value.layouts, defaults.layouts),
    };
  } catch {
    return defaults;
  }
}

export function saveSegmentWorkbenchPreferences(
  preferences: SegmentWorkbenchPreferences,
  storage: JsonStorage = defaultStorage(),
): void {
  try {
    storage.setItem(SEGMENT_WORKBENCH_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Presentation preferences are optional when browser storage is unavailable.
  }
}

export function mergeSegmentLayouts(
  saved: Record<string, SegmentWidgetLayout[]>,
  defaults = defaultLayouts,
): Record<string, SegmentWidgetLayout[]> {
  return Object.fromEntries(Object.entries(defaults).map(([breakpoint, fallback]) => {
    const existing = saved[breakpoint] ?? [];
    const existingById = new Map(existing.map((item) => [item.i, item]));
    return [breakpoint, fallback.map((item) => {
      const merged = { ...item, ...existingById.get(item.i), i: item.i };
      return {
        ...merged,
        minW: item.minW,
        minH: item.minH,
        w: Math.max(merged.w, item.minW ?? 1),
        h: Math.max(merged.h, item.minH ?? 1),
      };
    })];
  }));
}

export function canHideWidget(
  visibleWidgets: Record<SegmentWidgetId, boolean>,
  widgetId: SegmentWidgetId,
): boolean {
  if (!visibleWidgets[widgetId]) return true;
  return SEGMENT_WIDGET_IDS.filter((id) => visibleWidgets[id]).length > 1;
}

function normalizeVisibleWidgets(value: Record<string, unknown>): Record<SegmentWidgetId, boolean> {
  return Object.fromEntries(SEGMENT_WIDGET_IDS.map((id) => [id, value[id] ?? true])) as Record<SegmentWidgetId, boolean>;
}

function isVisibleWidgetRecord(value: unknown): value is Record<string, boolean> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => SEGMENT_WIDGET_IDS.includes(key as SegmentWidgetId) && typeof item === "boolean");
}

function isLayoutRecord(value: unknown): value is Record<string, SegmentWidgetLayout[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((items) => Array.isArray(items) && items.every(isWidgetLayout));
}

function isWidgetLayout(value: unknown): value is SegmentWidgetLayout {
  if (!isRecord(value) || !SEGMENT_WIDGET_IDS.includes(value.i as SegmentWidgetId)) return false;
  return [value.x, value.y, value.w, value.h].every((item) => Number.isInteger(item) && Number(item) >= 0)
    && Number(value.w) > 0
    && Number(value.h) > 0
    && (value.minW === undefined || Number.isInteger(value.minW) && Number(value.minW) > 0)
    && (value.minH === undefined || Number.isInteger(value.minH) && Number(value.minH) > 0);
}

function cloneLayouts(layouts: Record<string, SegmentWidgetLayout[]>): Record<string, SegmentWidgetLayout[]> {
  return Object.fromEntries(Object.entries(layouts).map(([key, items]) => [key, items.map((item) => ({ ...item }))]));
}

function compactLayout(): SegmentWidgetLayout[] {
  return [
    { i: "map", x: 0, y: 0, w: 1, h: 9, minW: 1, minH: 8 },
    { i: "telemetry", x: 0, y: 9, w: 1, h: 15, minW: 1, minH: 15 },
    { i: "evidence", x: 0, y: 24, w: 1, h: 7, minW: 1, minH: 5 },
    { i: "variation", x: 0, y: 31, w: 1, h: 7, minW: 1, minH: 5 },
    { i: "laps", x: 0, y: 38, w: 1, h: 7, minW: 1, minH: 5 },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultStorage(): JsonStorage {
  return typeof localStorage === "undefined"
    ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
    : localStorage;
}
