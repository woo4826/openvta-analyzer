import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../I18nProvider";
import {
  detectInitialLanguage,
  interpolate,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  languages,
  normalizeLanguage,
  translations,
  type LanguageCode,
} from "../locales";
import { useI18n } from "../useI18n";

describe("i18n language helpers", () => {
  it("normalizes supported language tags", () => {
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("ko-KR")).toBe("ko");
    expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeLanguage("zh")).toBe("zh-CN");
    expect(normalizeLanguage("pt-BR")).toBeUndefined();
  });

  it("uses stored language before browser language", () => {
    expect(
      detectInitialLanguage({
        storage: storageWith("ja"),
        navigatorLanguages: ["ko-KR"],
      }),
    ).toBe("ja");
  });

  it("ignores invalid storage before checking browser language", () => {
    expect(
      detectInitialLanguage({
        storage: storageWith("pt-BR"),
        navigatorLanguages: ["ko-KR"],
      }),
    ).toBe("ko");
  });

  it("falls back to English for invalid storage and unsupported browser language", () => {
    expect(
      detectInitialLanguage({
        storage: storageWith("pt-BR"),
        navigatorLanguages: ["pt-BR"],
      }),
    ).toBe("en");
  });

  it("falls back without crashing when browser localStorage access is blocked", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });

    try {
      expect(detectInitialLanguage({ navigatorLanguages: ["ko-KR"] })).toBe("ko");
    } finally {
      if (descriptor) {
        Object.defineProperty(window, "localStorage", descriptor);
      }
    }
  });

  it("interpolates values and renders missing values as empty strings", () => {
    expect(interpolate("Current language: {language}", { language: "Korean" })).toBe("Current language: Korean");
    expect(interpolate("Current language: {language}")).toBe("Current language: ");
  });

  it("keeps every translation dictionary complete", () => {
    const expectedKeys = Object.keys(translations.en).sort();

    expect(Object.keys(languages).sort()).toEqual(Object.keys(translations).sort());

    for (const language of Object.keys(translations) as LanguageCode[]) {
      expect(Object.keys(translations[language]).sort()).toEqual(expectedKeys);
      expect(isSupportedLanguage(language)).toBe(true);
    }
  });

  it("includes primary Korean onboarding tour labels", () => {
    expect(translations.ko["tour.step.welcome.title"]).toBe("VTA 파일을 브라우저에서 분석");
    expect(translations.ko["settings.restartGuide"]).toBe("가이드 다시 보기");
  });
});

describe("I18nProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("lang");
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("lang");
  });

  it("initializes from storage, translates strings, persists changes, and updates document language", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "ko-KR");

    render(createElement(I18nProvider, null, createElement(I18nConsumer)));

    expect(screen.getByTestId("language")).toHaveTextContent("ko");
    expect(screen.getByTestId("language-count")).toHaveTextContent("7");
    expect(screen.getByTestId("translated")).toHaveTextContent("현재 언어: 한국어");

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("ko");
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ko");
    });

    await user.click(screen.getByRole("button", { name: "Use Japanese" }));

    expect(screen.getByTestId("language")).toHaveTextContent("ja");
    expect(screen.getByTestId("translated")).toHaveTextContent("現在の言語: 日本語");

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("ja");
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ja");
    });
  });
});

function I18nConsumer() {
  const { language, languages: languageOptions, setLanguage, t } = useI18n();

  return createElement(
    "div",
    null,
    createElement("div", { "data-testid": "language" }, language),
    createElement("div", { "data-testid": "language-count" }, Object.keys(languageOptions).length),
    createElement("div", { "data-testid": "translated" }, t("language.current", { language: languages[language].nativeName })),
    createElement("button", { type: "button", onClick: () => setLanguage("ja") }, "Use Japanese"),
  );
}

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return {
    getItem: (key: string) => (key === LANGUAGE_STORAGE_KEY ? value : null),
  };
}
