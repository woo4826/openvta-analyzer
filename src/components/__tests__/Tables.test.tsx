import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "../../domain/export";
import type { VtaFile } from "../../domain/types";
import { interpolate, languages, translations } from "../../i18n/locales";
import { I18nContext } from "../../i18n/useI18n";
import { Tables } from "../Tables";

vi.mock("../../domain/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../domain/export")>();
  return {
    ...actual,
    downloadText: vi.fn(),
  };
});

describe("Tables localization", () => {
  beforeEach(() => {
    vi.mocked(downloadText).mockClear();
  });

  it("keeps the summary visible-row CSV canonical when the UI is Korean", async () => {
    const user = userEvent.setup();

    renderWithKoreanI18n(<Tables file={file()} sensors={[]} />);

    await user.click(screen.getByRole("tab", { name: translations.ko["tables.tab.summary"] }));
    expect(screen.getByRole("cell", { name: translations.ko["tables.summary.sourceName"] })).toBeVisible();

    await user.click(screen.getByRole("button", { name: translations.ko["tables.exportVisibleRows"] }));

    expect(downloadText).toHaveBeenCalledOnce();
    const [filename, csv, type] = vi.mocked(downloadText).mock.calls[0];
    expect(filename).toBe("summary-visible.csv");
    expect(type).toBe("text/csv");
    expect(csv).toContain("metric,value,detail\n");
    expect(csv).toContain("Source name,test.Vta,");
    expect(csv).toContain("Selected point count,0,All visible points");
    expect(csv).not.toContain(translations.ko["tables.summary.sourceName"]);
    expect(csv).not.toContain(translations.ko["tables.summary.scope.allVisiblePoints"]);
  });
});

function renderWithKoreanI18n(children: ReactElement) {
  return render(
    <I18nContext.Provider
      value={{
        language: "ko",
        setLanguage: () => undefined,
        languages,
        t: (key, values) => interpolate(translations.ko[key], values),
      }}
    >
      {children}
    </I18nContext.Provider>,
  );
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
