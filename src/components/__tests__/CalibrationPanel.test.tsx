import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterSettings, VtaFile } from "../../domain/types";
import { interpolate, languages, translations, type LanguageCode, type TranslationKey } from "../../i18n/locales";
import { I18nContext } from "../../i18n/useI18n";
import { CalibrationPanel } from "../CalibrationPanel";

vi.mock("../Charts", () => ({
  Charts: () => <div data-testid="calibration-charts" />,
}));

describe("CalibrationPanel localization", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("relocalizes status messages after the language changes", async () => {
    const user = userEvent.setup();

    renderWithLanguageSwitcher(
      <CalibrationPanel
        file={file()}
        sensors={[]}
        transformedSensors={[]}
        onCalibration={vi.fn()}
        onCalibrationFile={vi.fn()}
        filterSettings={filterSettings()}
        onFilterSettings={vi.fn()}
        transformMode="raw"
        onTransformMode={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Estimate from current file" }));
    expect(screen.getByRole("status")).toHaveTextContent(translations.en["calibration.status.noSamplesCurrentFile"]);

    await user.click(screen.getByRole("button", { name: "Use Korean" }));
    expect(screen.getByRole("status")).toHaveTextContent(translations.ko["calibration.status.noSamplesCurrentFile"]);
  });
});

function renderWithLanguageSwitcher(children: ReactElement) {
  return render(<LanguageSwitcher>{children}</LanguageSwitcher>);
}

function LanguageSwitcher({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      languages,
      t: (key: TranslationKey, values?: Record<string, string | number>) => interpolate(translations[language][key], values),
    }),
    [language],
  );

  return (
    <I18nContext.Provider value={value}>
      <button type="button" onClick={() => setLanguage("ko")}>
        Use Korean
      </button>
      {children}
    </I18nContext.Provider>
  );
}

function filterSettings(): FilterSettings {
  return {
    enabled: false,
    cutoffHz: 5,
    channels: { x: true, y: true, z: true },
  };
}

function file(): VtaFile {
  return {
    sourceName: "test.Vta",
    detectedFormat: "modern-openvta",
    headers: [],
    rawLines: [],
    gpsPoints: [],
    enhancedPoints: [],
    sensorPoints: [],
    parseWarnings: [],
  };
}
