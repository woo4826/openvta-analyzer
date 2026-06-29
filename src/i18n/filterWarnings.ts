import { FILTER_WARNING_CUTOFF_OUT_OF_RANGE, FILTER_WARNING_IRREGULAR_TIMESTAMPS } from "../domain/filtering";
import type { Translate } from "./messages";

export function localizeFilterWarning(message: string, t: Translate): string {
  if (message === FILTER_WARNING_CUTOFF_OUT_OF_RANGE) {
    return t("calibration.filterWarning.cutoffOutOfRange");
  }
  if (message === FILTER_WARNING_IRREGULAR_TIMESTAMPS) {
    return t("calibration.filterWarning.irregularTimestamps");
  }
  return message;
}
