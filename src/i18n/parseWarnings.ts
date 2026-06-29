import type { ParseWarning } from "../domain/types";
import type { Translate } from "./messages";

export function localizeParseWarning(warning: ParseWarning, t: Translate): string {
  switch (warning.code) {
    case "unknown-row":
      if (!hasParams(warning, ["prefix"])) return warning.message;
      return t("warnings.parse.unknownRow", { prefix: value(warning, "prefix") });
    case "short-gps-row":
      if (!hasParams(warning, ["minimum"])) return warning.message;
      return t("warnings.parse.shortGpsRow", { minimum: value(warning, "minimum") });
    case "invalid-coordinate":
      if (!hasParams(warning, ["latitude", "longitude"])) return warning.message;
      return t("warnings.parse.invalidCoordinate", {
        latitude: value(warning, "latitude"),
        longitude: value(warning, "longitude"),
      });
    case "low-satellite-count":
      if (!hasParams(warning, ["count", "minimum"])) return warning.message;
      return t("warnings.parse.lowSatelliteCount", {
        count: value(warning, "count"),
        minimum: value(warning, "minimum"),
      });
    case "short-sensor-row":
      if (!hasParams(warning, ["minimum"])) return warning.message;
      return value(warning, "sensorKind") === "standalone"
        ? t("warnings.parse.shortStandaloneSensorRow", { minimum: value(warning, "minimum") })
        : t("warnings.parse.shortSensorRow", { minimum: value(warning, "minimum") });
    default:
      return warning.message;
  }
}

function hasParams(warning: ParseWarning, keys: string[]): boolean {
  return keys.every((key) => warning.params?.[key] !== undefined);
}

function value(warning: ParseWarning, key: string): string | number {
  return warning.params?.[key] ?? "";
}
