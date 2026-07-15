import { describe, expect, it, vi } from "vitest";
import {
  SEGMENT_WORKBENCH_STORAGE_KEY,
  canHideWidget,
  defaultSegmentWorkbenchPreferences,
  loadSegmentWorkbenchPreferences,
  mergeSegmentLayouts,
  saveSegmentWorkbenchPreferences,
} from "../segmentWorkbenchPreferences";

describe("segment workbench preferences", () => {
  it("defaults to a focus/reference dashboard with every widget visible", () => {
    const preferences = defaultSegmentWorkbenchPreferences();

    expect(preferences).toMatchObject({
      version: 1,
      drawerOpen: false,
      lapVisibility: "focus-reference",
      snapToSections: true,
      visibleWidgets: {
        opportunities: true,
        map: true,
        evidence: true,
        variation: true,
        telemetry: true,
        laps: true,
      },
    });
    expect(preferences.layouts.lg.map((item) => item.i)).toEqual([
      "opportunities",
      "map",
      "telemetry",
      "evidence",
      "variation",
      "laps",
    ]);
  });

  it("round-trips validated preferences through storage", () => {
    const store = new Map<string, string>();
    const storage = memoryStorage(store);
    const preferences = defaultSegmentWorkbenchPreferences();
    preferences.drawerOpen = true;
    preferences.lapVisibility = "focus-only";
    preferences.snapToSections = false;
    preferences.visibleWidgets.opportunities = false;
    preferences.layouts.lg[0] = { ...preferences.layouts.lg[0], x: 4, y: 3 };

    saveSegmentWorkbenchPreferences(preferences, storage);

    expect(store.has(SEGMENT_WORKBENCH_STORAGE_KEY)).toBe(true);
    expect(loadSegmentWorkbenchPreferences(storage)).toEqual(preferences);
  });

  it("falls back safely for malformed JSON and invalid preference values", () => {
    const malformed = {
      getItem: () => "{not json",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadSegmentWorkbenchPreferences(malformed)).toEqual(defaultSegmentWorkbenchPreferences());

    const invalid = {
      getItem: () => JSON.stringify({
        version: 1,
        drawerOpen: "yes",
        lapVisibility: "reference-only",
        snapToSections: 1,
        visibleWidgets: { opportunities: false, unknown: true },
        layouts: { lg: [{ i: "map", x: Number.NaN, y: 0, w: 6, h: 4 }] },
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadSegmentWorkbenchPreferences(invalid)).toEqual(defaultSegmentWorkbenchPreferences());
  });

  it("merges saved layouts with defaults so newly introduced widgets remain available", () => {
    const defaults = defaultSegmentWorkbenchPreferences().layouts;
    const merged = mergeSegmentLayouts({
      lg: [{ i: "map", x: 9, y: 7, w: 3, h: 4 }],
    }, defaults);

    expect(merged.lg.find((item) => item.i === "map")).toMatchObject({ x: 9, y: 7, w: 3, h: 4 });
    expect(new Set(merged.lg.map((item) => item.i))).toEqual(new Set(defaults.lg.map((item) => item.i)));
    expect(merged.md).toEqual(defaults.md);
  });

  it("does not allow the final visible widget to be hidden", () => {
    const all = defaultSegmentWorkbenchPreferences().visibleWidgets;
    expect(canHideWidget(all, "map")).toBe(true);
    expect(canHideWidget({ ...all, opportunities: false, evidence: false, variation: false, telemetry: false, laps: false }, "map")).toBe(false);
  });
});

function memoryStorage(store: Map<string, string>) {
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}
