import { describe, expect, it } from "vitest";
import { interpolate, translations } from "../locales";
import { localizeParseWarning } from "../parseWarnings";

const t = (key: keyof typeof translations.en, values?: Record<string, string | number>) =>
  interpolate(translations.ko[key], values);

describe("localizeParseWarning", () => {
  it("falls back to the canonical message when required params are missing", () => {
    expect(
      localizeParseWarning(
        {
          lineNumber: 1,
          code: "invalid-coordinate",
          message: "Invalid coordinate latitude=bad longitude=151.",
        },
        t,
      ),
    ).toBe("Invalid coordinate latitude=bad longitude=151.");
  });

  it("localizes known warnings when required params are present", () => {
    expect(
      localizeParseWarning(
        {
          lineNumber: 1,
          code: "low-satellite-count",
          message: "GPS row has 3 satellites; 4 or more is preferred for 3D fixes.",
          params: { count: 3, minimum: 4 },
        },
        t,
      ),
    ).toBe("GPS 행의 위성 수가 3개입니다. 3D 위치 고정에는 4개 이상을 권장합니다.");
  });
});
