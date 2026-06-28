import type { TranslationKey } from "./locales";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function localizeFilterWarning(message: string, t: Translate): string {
  if (message === "Filter skipped because the cutoff frequency is outside the valid range.") {
    return t("calibration.filterWarning.cutoffOutOfRange");
  }
  if (message === "Sensor timestamps are irregular; an effective sample rate was estimated for filtering.") {
    return t("calibration.filterWarning.irregularTimestamps");
  }
  return message;
}
