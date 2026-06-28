# I18n Language Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multilingual UI support with English and Korean as first-class languages and five secondary languages.

**Architecture:** Use a local typed translation dictionary and React context provider. UI components call `useI18n()` or receive translated labels through props. Export schemas and parsed data remain stable in English for compatibility.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Playwright, GitHub Pages.

---

## File Structure

- Create `src/i18n/locales.ts`: language metadata, translation dictionaries, fallback helpers, interpolation.
- Create `src/i18n/I18nProvider.tsx`: React provider with local storage persistence and browser-language detection.
- Create `src/i18n/useI18n.ts`: hook and context exports.
- Create `src/i18n/__tests__/i18n.test.ts`: unit tests for fallback, persistence, interpolation, and dictionary completeness.
- Modify `src/main.tsx`: wrap `<App />` in `I18nProvider`.
- Modify `src/app/App.tsx`: top-bar language selector and app shell strings.
- Modify components under `src/components/`: replace user-facing static strings with translation keys.
- Modify `tests/analyzer.spec.ts`: add Korean language persistence and workflow assertions while preserving English tests.
- Modify `README.md`: document language support and compatibility boundaries.

---

### Task 1: Core I18n Layer

**Files:**
- Create: `src/i18n/locales.ts`
- Create: `src/i18n/I18nProvider.tsx`
- Create: `src/i18n/useI18n.ts`
- Create: `src/i18n/__tests__/i18n.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing unit tests**

Create tests proving:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  LANGUAGE_STORAGE_KEY,
  detectInitialLanguage,
  interpolate,
  isSupportedLanguage,
  languages,
  normalizeLanguage,
  translations,
} from "../locales";

describe("i18n helpers", () => {
  it("normalizes supported and regional language codes", () => {
    expect(normalizeLanguage("ko-KR")).toBe("ko");
    expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("pt-BR")).toBeUndefined();
  });

  it("detects stored language before browser language", () => {
    const store = new Map([[LANGUAGE_STORAGE_KEY, "ko"]]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(detectInitialLanguage(storage, ["ja-JP"])).toBe("ko");
  });

  it("falls back to English for invalid stored and unsupported browser languages", () => {
    const storage = {
      getItem: () => "bad",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(detectInitialLanguage(storage, ["pt-BR"])).toBe("en");
  });

  it("interpolates values without exposing missing placeholders", () => {
    expect(interpolate("Loaded {count} files from {name}.", { count: 3, name: "session.zip" })).toBe(
      "Loaded 3 files from session.zip.",
    );
    expect(interpolate("Missing {value}.", {})).toBe("Missing .");
  });

  it("has every supported language dictionary keyed like English", () => {
    const englishKeys = Object.keys(translations.en).sort();
    for (const language of languages) {
      expect(isSupportedLanguage(language.code)).toBe(true);
      expect(Object.keys(translations[language.code]).sort()).toEqual(englishKeys);
    }
  });
});
```

- [ ] **Step 2: Implement locale dictionaries and helpers**

Implement:

```ts
export const LANGUAGE_STORAGE_KEY = "openvta.language.v1";
export type LanguageCode = "en" | "ko" | "ja" | "zh-CN" | "es" | "fr" | "de";
export interface LanguageOption { code: LanguageCode; nativeName: string; englishName: string; quality: "primary" | "secondary"; }
export const languages: LanguageOption[] = [...];
export const translations: Record<LanguageCode, Record<TranslationKey, string>> = {...};
export function isSupportedLanguage(value: string): value is LanguageCode;
export function normalizeLanguage(value?: string): LanguageCode | undefined;
export function detectInitialLanguage(storage?: StorageLike, browserLanguages?: readonly string[]): LanguageCode;
export function interpolate(template: string, values?: Record<string, string | number>): string;
```

The English dictionary must contain all keys used by app/components. Korean translations should be natural and domain-aware. Secondary languages should be short, functional, and consistent.

- [ ] **Step 3: Implement provider and hook**

Implement `I18nProvider` with:

- state initialized from `detectInitialLanguage()`
- persistence to `localStorage`
- `document.documentElement.lang = language`
- `t(key, values?)`

- [ ] **Step 4: Wrap app**

Wrap `<App />` in `src/main.tsx`:

```tsx
<React.StrictMode>
  <I18nProvider>
    <App />
  </I18nProvider>
</React.StrictMode>
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm test -- src/i18n/__tests__/i18n.test.ts
pnpm typecheck
```

Commit:

```bash
git add src/i18n src/main.tsx
git commit -m "Add core i18n language provider"
```

---

### Task 2: Localize App Shell And Core Components

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/components/FileDrop.tsx`
- Modify: `src/components/FileTray.tsx`
- Modify: `src/components/WorkspaceStatus.tsx`
- Modify: `src/components/MapControls.tsx`
- Modify: `src/components/RouteMap.tsx`
- Modify: `src/components/Overview.tsx`
- Modify: `src/components/WarningList.tsx`

- [ ] **Step 1: Add language selector to the top bar**

Add a compact select labelled with `t("language.label")`. Options use `nativeName` and a secondary quality marker only in the title, not visible text.

- [ ] **Step 2: Localize app shell strings**

Localize:

- brand subtitle
- active-file select label
- open VTA/ZIP
- load sample
- sample CAL
- privacy note
- footer tile/export privacy note
- load errors
- tab labels

- [ ] **Step 3: Localize file loading and workspace controls**

Localize FileDrop, FileTray, WorkspaceStatus, MapControls, RouteMap fallback/status strings.

- [ ] **Step 4: Localize overview and warning panels**

Localize Overview panel titles, metric labels, empty states, region/segment labels, and WarningList static labels.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm typecheck
pnpm test
```

Commit:

```bash
git add src/app src/components src/i18n
git commit -m "Localize app shell and overview"
```

---

### Task 3: Localize Charts, Tables, Calibration, And Export

**Files:**
- Modify: `src/components/Charts.tsx`
- Modify: `src/components/Tables.tsx`
- Modify: `src/components/CalibrationPanel.tsx`
- Modify: `src/components/ExportPanel.tsx`
- Modify: `src/components/ChartPanel.tsx` only if chart aria labels need translation props
- Modify: `src/i18n/locales.ts`

- [ ] **Step 1: Localize charts**

Localize chart section title, chart titles, average labels, transform labels, acceleration series labels, and chart aria labels. Keep units unchanged.

- [ ] **Step 2: Localize tables**

Localize table tab labels, column headers, search labels, status text, empty states, and visible-row export labels. Keep downloaded CSV headers in English.

- [ ] **Step 3: Localize calibration**

Localize calibration controls, static-window text, preset actions, filter settings, status messages, and transform preview labels.

- [ ] **Step 4: Localize export**

Localize export controls, segment preview labels, button text, and compare-mode transformed export title. Keep generated export schemas and file contents in English.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm typecheck
pnpm test
```

Commit:

```bash
git add src/components src/i18n
git commit -m "Localize analysis tools"
```

---

### Task 4: E2E, Docs, Visual Verification, And Deployment

**Files:**
- Modify: `tests/analyzer.spec.ts`
- Modify: `README.md`
- Optional Modify: `public/manifest.webmanifest`

- [ ] **Step 1: Add E2E language test**

Add a test that switches to Korean, reloads, loads the sample, and verifies Korean labels in Overview, Calibration, and Export.

- [ ] **Step 2: Preserve English E2E**

Keep existing English tests stable. Prefer exact English labels for existing tests and Korean labels only in the new test.

- [ ] **Step 3: Update README**

Document supported languages, primary/secondary quality, local storage key, and export compatibility boundary.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

- [ ] **Step 5: Browser visual verification**

Run preview and verify English/Korean on desktop/mobile:

- language selector visible without toolbar overlap
- Korean overview labels fit
- Korean calibration/export controls fit
- charts render nonblank
- no horizontal overflow on mobile

- [ ] **Step 6: Commit and deploy**

Commit:

```bash
git add tests README.md public src
git commit -m "Document and verify multilingual UI"
```

Push branch and fast-forward `main` only after local verification passes:

```bash
git push -u origin codex/i18n-language-support
git push origin HEAD:main
```

Verify GitHub Actions CI and Pages deploy pass.
