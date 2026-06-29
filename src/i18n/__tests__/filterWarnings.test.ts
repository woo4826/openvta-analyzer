import { describe, expect, it } from "vitest";
import { FILTER_WARNING_CUTOFF_OUT_OF_RANGE, FILTER_WARNING_IRREGULAR_TIMESTAMPS } from "../../domain/filtering";
import { interpolate, translations } from "../locales";
import { localizeFilterWarning } from "../filterWarnings";

const t = (key: keyof typeof translations.en, values?: Record<string, string | number>) =>
  interpolate(translations.ko[key], values);

describe("localizeFilterWarning", () => {
  it("localizes known filter warning constants", () => {
    expect(localizeFilterWarning(FILTER_WARNING_CUTOFF_OUT_OF_RANGE, t)).toBe(
      translations.ko["calibration.filterWarning.cutoffOutOfRange"],
    );
    expect(localizeFilterWarning(FILTER_WARNING_IRREGULAR_TIMESTAMPS, t)).toBe(
      translations.ko["calibration.filterWarning.irregularTimestamps"],
    );
  });

  it("passes unknown warning strings through", () => {
    expect(localizeFilterWarning("Unknown warning.", t)).toBe("Unknown warning.");
  });
});
