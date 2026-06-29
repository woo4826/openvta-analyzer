# Guided Onboarding Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multilingual guided onboarding overlay that auto-runs for first-time users, persists skip/completion, and can be replayed from Settings.

**Architecture:** Keep tour state in `App`, persist durable status through `src/domain/settings.ts`, define steps in `src/app/tourSteps.ts`, and render the overlay in a focused `GuidedTour` component. The overlay uses stable DOM selectors and can request tab changes or sample loading without mutating parsed file data directly.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, Playwright, localStorage through existing settings helpers, existing local i18n dictionaries.

---

## File Structure

- Modify `src/domain/settings.ts`: add tour storage key, `OnboardingTourState`, coercion, load/save helpers, and skip/complete constructors.
- Modify `src/domain/__tests__/settings.test.ts`: add storage tests for missing, invalid, skipped, completed, and blocked storage states.
- Create `src/app/tourSteps.ts`: declare `TourStepId`, `TourStep`, and `buildTourSteps(hasActiveFile)`.
- Create `src/components/GuidedTour.tsx`: render responsive overlay, target highlight, accessible callout, keyboard handling, and optional sample action.
- Create `src/components/__tests__/GuidedTour.test.tsx`: component tests for rendering, navigation, skip, done, keyboard, missing target fallback, and mobile class behavior.
- Modify `src/app/App.tsx`: add Settings popover, tour state orchestration, selectors/attributes for stable tour targets, tab coordination, replay action, and tour mount.
- Modify `src/i18n/locales.ts`: add `settings.*` and `tour.*` keys to all language dictionaries.
- Modify `src/i18n/__tests__/i18n.test.ts`: add focused Korean tour text assertion while existing completeness test guards all keys.
- Modify `src/styles.css`: add Settings popover and guided tour overlay/callout/bottom-sheet styles.
- Modify `tests/analyzer.spec.ts`: seed tour completion for existing workflow tests, then add dedicated tour E2E tests.

## Task 1: Tour Persistence Helpers

**Files:**
- Modify: `src/domain/settings.ts`
- Test: `src/domain/__tests__/settings.test.ts`

- [ ] **Step 1: Add failing storage tests**

Append these tests inside the existing `describe("settings helpers", ...)` block in `src/domain/__tests__/settings.test.ts`:

```ts
  it("loads default onboarding tour state when storage is missing or invalid", () => {
    const emptyStorage = {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const invalidStorage = {
      getItem: () => "{",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(loadOnboardingTourState(emptyStorage)).toEqual({ status: "new", version: 1 });
    expect(loadOnboardingTourState(invalidStorage)).toEqual({ status: "new", version: 1 });
  });

  it("saves skipped and completed onboarding tour states", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: vi.fn(),
    };

    saveOnboardingTourState(skippedOnboardingTourState(1700000000000), storage);
    expect(loadOnboardingTourState(storage)).toEqual({
      status: "skipped",
      skippedAt: 1700000000000,
      version: 1,
    });

    saveOnboardingTourState(completedOnboardingTourState(1700000001000), storage);
    expect(loadOnboardingTourState(storage)).toEqual({
      status: "completed",
      completedAt: 1700000001000,
      version: 1,
    });
    expect(store.has(ONBOARDING_TOUR_STORAGE_KEY)).toBe(true);
  });

  it("rejects malformed onboarding tour states", () => {
    const storage = {
      getItem: () => JSON.stringify({ status: "completed", completedAt: "soon", version: 1 }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(loadOnboardingTourState(storage)).toEqual({ status: "new", version: 1 });
  });
```

Also add these imports at the top:

```ts
  completedOnboardingTourState,
  loadOnboardingTourState,
  ONBOARDING_TOUR_STORAGE_KEY,
  saveOnboardingTourState,
  skippedOnboardingTourState,
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm test -- src/domain/__tests__/settings.test.ts
```

Expected: FAIL because the onboarding helpers are not exported yet.

- [ ] **Step 3: Implement storage helpers**

Add to `src/domain/settings.ts` below `CALIBRATION_PRESETS_STORAGE_KEY`:

```ts
export const ONBOARDING_TOUR_STORAGE_KEY = "openvta.onboardingTour.v1";

export interface OnboardingTourState {
  status: "new" | "skipped" | "completed";
  version: 1;
  skippedAt?: number;
  completedAt?: number;
}

export function loadOnboardingTourState(storage: JsonStorage = defaultStorage()): OnboardingTourState {
  return coerceOnboardingTourState(loadJsonSetting<unknown>(ONBOARDING_TOUR_STORAGE_KEY, defaultOnboardingTourState(), storage));
}

export function saveOnboardingTourState(
  state: OnboardingTourState,
  storage: JsonStorage = defaultStorage(),
): void {
  saveJsonSetting(ONBOARDING_TOUR_STORAGE_KEY, state, storage);
}

export function skippedOnboardingTourState(timestamp = Date.now()): OnboardingTourState {
  return { status: "skipped", skippedAt: timestamp, version: 1 };
}

export function completedOnboardingTourState(timestamp = Date.now()): OnboardingTourState {
  return { status: "completed", completedAt: timestamp, version: 1 };
}

export function defaultOnboardingTourState(): OnboardingTourState {
  return { status: "new", version: 1 };
}
```

Add below `coerceCalibrationPresets`:

```ts
function coerceOnboardingTourState(value: unknown): OnboardingTourState {
  if (!isRecord(value) || value.version !== 1) {
    return defaultOnboardingTourState();
  }

  if (value.status === "new") {
    return defaultOnboardingTourState();
  }

  if (value.status === "skipped" && isOptionalFiniteNumber(value.skippedAt)) {
    return {
      status: "skipped",
      skippedAt: value.skippedAt,
      version: 1,
    };
  }

  if (value.status === "completed" && isOptionalFiniteNumber(value.completedAt)) {
    return {
      status: "completed",
      completedAt: value.completedAt,
      version: 1,
    };
  }

  return defaultOnboardingTourState();
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm test -- src/domain/__tests__/settings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/settings.ts src/domain/__tests__/settings.test.ts
git commit -m "Add onboarding tour persistence"
```

## Task 2: Tour Step Model And Translations

**Files:**
- Create: `src/app/tourSteps.ts`
- Modify: `src/i18n/locales.ts`
- Test: `src/i18n/__tests__/i18n.test.ts`

- [ ] **Step 1: Create tour step definitions**

Create `src/app/tourSteps.ts`:

```ts
import type { TranslationKey } from "../i18n/locales";

export type TourStepId =
  | "welcome"
  | "open-data"
  | "file-workspace"
  | "overview"
  | "workspace"
  | "charts"
  | "calibration"
  | "export";

export type TourPlacement = "auto" | "center" | "bottom";
export type TourRequiredTab = "overview" | "charts" | "tables" | "calibration" | "export";

export interface TourStep {
  id: TourStepId;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  target?: string;
  requiredTab?: TourRequiredTab;
  placement?: TourPlacement;
  requiresFile?: boolean;
  sampleAction?: boolean;
}

export function buildTourSteps(hasActiveFile: boolean): TourStep[] {
  return [
    {
      id: "welcome",
      titleKey: "tour.step.welcome.title",
      bodyKey: "tour.step.welcome.body",
      target: "[data-tour='privacy-note']",
      placement: "center",
    },
    {
      id: "open-data",
      titleKey: "tour.step.openData.title",
      bodyKey: hasActiveFile ? "tour.step.openData.loadedBody" : "tour.step.openData.body",
      target: hasActiveFile ? "[data-tour='topbar-file-actions']" : "[data-tour='file-drop']",
      sampleAction: !hasActiveFile,
    },
    {
      id: "file-workspace",
      titleKey: "tour.step.fileWorkspace.title",
      bodyKey: "tour.step.fileWorkspace.body",
      target: "[data-tour='file-rail']",
      requiresFile: true,
    },
    {
      id: "overview",
      titleKey: "tour.step.overview.title",
      bodyKey: "tour.step.overview.body",
      target: "[data-tour='overview-panel']",
      requiredTab: "overview",
      requiresFile: true,
    },
    {
      id: "workspace",
      titleKey: "tour.step.workspace.title",
      bodyKey: "tour.step.workspace.body",
      target: "[data-tour='workspace-status']",
      requiresFile: true,
    },
    {
      id: "charts",
      titleKey: "tour.step.charts.title",
      bodyKey: "tour.step.charts.body",
      target: "[data-tour='analysis-tabs']",
      requiredTab: "charts",
      requiresFile: true,
    },
    {
      id: "calibration",
      titleKey: "tour.step.calibration.title",
      bodyKey: "tour.step.calibration.body",
      target: "[data-tour='analysis-tabs']",
      requiredTab: "calibration",
      requiresFile: true,
    },
    {
      id: "export",
      titleKey: "tour.step.export.title",
      bodyKey: "tour.step.export.body",
      target: "[data-tour='analysis-tabs']",
      requiredTab: "export",
      requiresFile: true,
    },
  ];
}

export function nextAvailableTourStepIndex(steps: TourStep[], startIndex: number, hasActiveFile: boolean): number {
  for (let index = startIndex; index < steps.length; index += 1) {
    if (!steps[index].requiresFile || hasActiveFile) {
      return index;
    }
  }
  return steps.length - 1;
}
```

- [ ] **Step 2: Add translation keys**

In `src/i18n/locales.ts`, add these English keys to `englishTranslations` before `status.ready`:

```ts
  "settings.menu": "Settings",
  "settings.restartGuide": "Restart guide",
  "settings.closeMenu": "Close settings",
  "tour.progress": "Step {current} of {total}",
  "tour.skip": "Skip",
  "tour.back": "Back",
  "tour.next": "Next",
  "tour.done": "Done",
  "tour.loadSample": "Load sample for tour",
  "tour.step.welcome.title": "Analyze VTA files locally",
  "tour.step.welcome.body": "OpenVTA Analyzer reads route, GPS, sensor, calibration, and export data in this browser. Your files are not uploaded by the app.",
  "tour.step.openData.title": "Start with your data or the sample",
  "tour.step.openData.body": "Choose VTA or ZIP files, drop them here, or load the built-in sample to follow the guided workflow without preparing a file.",
  "tour.step.openData.loadedBody": "You can add more VTA or ZIP files from the top bar at any time, or use the sample buttons to test the workflow.",
  "tour.step.fileWorkspace.title": "Check the active file",
  "tour.step.fileWorkspace.body": "The file rail shows the active session, detected format, row counts, warnings, and quick switching when multiple files are open.",
  "tour.step.overview.title": "Inspect the route overview",
  "tour.step.overview.body": "The overview combines the route plot, summary metrics, selected point details, segment summaries, and parser warnings.",
  "tour.step.workspace.title": "Control sources and transforms",
  "tour.step.workspace.body": "Use the workspace inspector to switch raw/enhanced GPS sources and compare raw, calibrated, filtered, or combined sensor views.",
  "tour.step.charts.title": "Read charts and selected ranges",
  "tour.step.charts.body": "Charts show velocity, distance, acceleration, orientation, and friction circle views. Selected ranges can drive segment analysis.",
  "tour.step.calibration.title": "Calibrate and filter sensors",
  "tour.step.calibration.body": "Load CAL data, estimate offsets, save presets, and preview raw, calibrated, or filtered acceleration before exporting.",
  "tour.step.export.title": "Export the result",
  "tour.step.export.body": "Export original or transformed VTA segments, GPS and sensor CSV files, validation rows, and summary JSON locally from the browser.",
```

Add equivalent keys to each non-English dictionary. Korean should use:

```ts
    "settings.menu": "설정",
    "settings.restartGuide": "가이드 다시 보기",
    "settings.closeMenu": "설정 닫기",
    "tour.progress": "{current}/{total}단계",
    "tour.skip": "건너뛰기",
    "tour.back": "이전",
    "tour.next": "다음",
    "tour.done": "완료",
    "tour.loadSample": "가이드용 샘플 불러오기",
    "tour.step.welcome.title": "VTA 파일을 브라우저에서 분석",
    "tour.step.welcome.body": "OpenVTA Analyzer는 경로, GPS, 센서, 보정, 내보내기 데이터를 이 브라우저에서 읽습니다. 앱이 파일을 업로드하지 않습니다.",
    "tour.step.openData.title": "내 데이터 또는 샘플로 시작",
    "tour.step.openData.body": "VTA 또는 ZIP 파일을 선택하거나 여기에 놓을 수 있습니다. 준비된 파일이 없으면 내장 샘플로 흐름을 따라가세요.",
    "tour.step.openData.loadedBody": "상단에서 언제든 VTA 또는 ZIP 파일을 더 열 수 있고, 샘플 버튼으로 workflow를 확인할 수 있습니다.",
    "tour.step.fileWorkspace.title": "활성 파일 확인",
    "tour.step.fileWorkspace.body": "파일 영역은 활성 세션, 감지된 형식, 행 개수, 경고, 여러 파일 간 전환을 보여줍니다.",
    "tour.step.overview.title": "경로 개요 살펴보기",
    "tour.step.overview.body": "개요는 경로 플롯, 요약 지표, 선택한 포인트, 구간 요약, 파서 경고를 함께 보여줍니다.",
    "tour.step.workspace.title": "소스와 변환 제어",
    "tour.step.workspace.body": "작업 공간 패널에서 원본/향상 GPS 소스를 전환하고 원본, 보정, 필터, 비교 센서 뷰를 선택합니다.",
    "tour.step.charts.title": "차트와 선택 범위 읽기",
    "tour.step.charts.body": "차트는 속도, 거리, 가속도, 자세, 마찰원 뷰를 보여줍니다. 선택 범위는 구간 분석에 사용할 수 있습니다.",
    "tour.step.calibration.title": "센서 보정과 필터링",
    "tour.step.calibration.body": "CAL 데이터를 불러오고, 오프셋을 추정하고, 프리셋을 저장하며, 내보내기 전에 원본/보정/필터 가속도를 미리 봅니다.",
    "tour.step.export.title": "결과 내보내기",
    "tour.step.export.body": "원본 또는 변환된 VTA 구간, GPS/센서 CSV, 검증 행, 요약 JSON을 브라우저에서 로컬로 내보냅니다.",
```

- [ ] **Step 3: Add focused i18n assertion**

Append this test to the first `describe("i18n language helpers", ...)` block in `src/i18n/__tests__/i18n.test.ts`:

```ts
  it("includes primary Korean onboarding tour labels", () => {
    expect(translations.ko["tour.step.welcome.title"]).toBe("VTA 파일을 브라우저에서 분석");
    expect(translations.ko["settings.restartGuide"]).toBe("가이드 다시 보기");
  });
```

- [ ] **Step 4: Run i18n tests**

Run:

```bash
pnpm test -- src/i18n/__tests__/i18n.test.ts
```

Expected: PASS after every language dictionary has all new keys.

- [ ] **Step 5: Commit**

```bash
git add src/app/tourSteps.ts src/i18n/locales.ts src/i18n/__tests__/i18n.test.ts
git commit -m "Add guided tour steps and translations"
```

## Task 3: GuidedTour Component And Styles

**Files:**
- Create: `src/components/GuidedTour.tsx`
- Create: `src/components/__tests__/GuidedTour.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write component tests**

Create `src/components/__tests__/GuidedTour.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { GuidedTour } from "../GuidedTour";
import type { TourStep } from "../../app/tourSteps";

const steps: TourStep[] = [
  {
    id: "welcome",
    titleKey: "tour.step.welcome.title",
    bodyKey: "tour.step.welcome.body",
    target: "[data-tour='target']",
  },
  {
    id: "export",
    titleKey: "tour.step.export.title",
    bodyKey: "tour.step.export.body",
    target: "[data-tour='missing']",
  },
];

describe("GuidedTour", () => {
  it("renders the active step and advances", async () => {
    const user = userEvent.setup();
    const onIndexChange = vi.fn();

    renderTour(<GuidedTour steps={steps} activeIndex={0} onIndexChange={onIndexChange} onSkip={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Analyze VTA files locally" })).toBeVisible();
    expect(screen.getByText("Step 1 of 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("calls skip and done actions", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    const onDone = vi.fn();

    renderTour(<GuidedTour steps={steps} activeIndex={1} onIndexChange={vi.fn()} onSkip={onSkip} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("uses fallback placement when the target is missing", () => {
    renderTour(<GuidedTour steps={steps} activeIndex={1} onIndexChange={vi.fn()} onSkip={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Export the result" })).toHaveClass("tour-callout-fallback");
  });
});

function renderTour(element: React.ReactElement) {
  return render(
    <I18nProvider>
      <div data-tour="target">Target</div>
      {element}
    </I18nProvider>,
  );
}
```

- [ ] **Step 2: Run component test and verify failure**

Run:

```bash
pnpm test -- src/components/__tests__/GuidedTour.test.tsx
```

Expected: FAIL because `GuidedTour` is not implemented.

- [ ] **Step 3: Implement `GuidedTour`**

Create `src/components/GuidedTour.tsx`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TourStep } from "../app/tourSteps";
import { useI18n } from "../i18n/useI18n";

interface GuidedTourProps {
  steps: TourStep[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onSkip: () => void;
  onDone: () => void;
  onLoadSample?: () => void;
}

interface TargetBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const calloutWidth = 360;
const viewportMargin = 14;

export function GuidedTour({ steps, activeIndex, onIndexChange, onSkip, onDone, onLoadSample }: GuidedTourProps) {
  const { t } = useI18n();
  const step = steps[activeIndex];
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [targetBox, setTargetBox] = useState<TargetBox | undefined>();
  const [isMobile, setIsMobile] = useState(false);

  const total = steps.length;
  const isFinalStep = activeIndex >= total - 1;

  useEffect(() => {
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      previousActiveElement.current?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

  useLayoutEffect(() => {
    function measure() {
      const mobile = window.matchMedia("(max-width: 680px)").matches;
      setIsMobile(mobile);

      if (!step?.target) {
        setTargetBox(undefined);
        return;
      }

      const target = document.querySelector(step.target);
      if (!(target instanceof HTMLElement)) {
        setTargetBox(undefined);
        return;
      }

      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      const rect = target.getBoundingClientRect();
      setTargetBox({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  const calloutStyle = useMemo<CSSProperties>(() => {
    if (isMobile || !targetBox) {
      return {};
    }

    const viewportWidth = document.documentElement.clientWidth;
    const left = Math.min(
      viewportWidth - calloutWidth - viewportMargin,
      Math.max(viewportMargin, targetBox.left + targetBox.width + viewportMargin),
    );
    const top = Math.max(viewportMargin, targetBox.top - window.scrollY);

    return {
      left,
      top,
      width: calloutWidth,
    };
  }, [isMobile, targetBox]);

  if (!step) {
    return null;
  }

  const highlightStyle: CSSProperties | undefined = targetBox
    ? {
        top: targetBox.top,
        left: targetBox.left,
        width: targetBox.width,
        height: targetBox.height,
      }
    : undefined;

  return (
    <div className="tour-layer" aria-live="polite">
      <div className="tour-scrim" />
      {highlightStyle ? <div className="tour-highlight" style={highlightStyle} aria-hidden="true" /> : null}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(step.titleKey)}
        tabIndex={-1}
        className={[
          "tour-callout",
          isMobile ? "tour-callout-mobile" : "",
          !targetBox || step.placement === "center" ? "tour-callout-fallback" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={calloutStyle}
      >
        <div className="tour-progress">
          {t("tour.progress", { current: activeIndex + 1, total })}
        </div>
        <h2>{t(step.titleKey)}</h2>
        <p>{t(step.bodyKey)}</p>
        {step.sampleAction && onLoadSample ? (
          <button type="button" className="button" onClick={onLoadSample}>
            {t("tour.loadSample")}
          </button>
        ) : null}
        <div className="tour-actions">
          <button type="button" className="button ghost" onClick={onSkip}>
            {t("tour.skip")}
          </button>
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={activeIndex === 0}
              onClick={() => onIndexChange(Math.max(0, activeIndex - 1))}
            >
              {t("tour.back")}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                if (isFinalStep) {
                  onDone();
                  return;
                }
                onIndexChange(activeIndex + 1);
              }}
            >
              {isFinalStep ? t("tour.done") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add styles**

Append to `src/styles.css` before the media queries:

```css
.settings-menu-wrap {
  position: relative;
}

.settings-popover {
  position: absolute;
  top: calc(100% + var(--space-2));
  right: 0;
  z-index: 20;
  min-width: 190px;
  padding: var(--space-3);
  border: 1px solid var(--color-shell-border);
  border-radius: var(--radius-3);
  background: var(--color-shell-elevated);
  box-shadow: 0 14px 32px rgba(16, 24, 32, 0.28);
}

.settings-popover .button {
  width: 100%;
}

.tour-layer {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
}

.tour-scrim {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 32, 0.48);
}

.tour-highlight {
  position: absolute;
  z-index: 101;
  border: 3px solid var(--color-teal);
  border-radius: var(--radius-3);
  box-shadow: 0 0 0 9999px rgba(16, 24, 32, 0.42), 0 0 0 6px rgba(15, 118, 110, 0.2);
  pointer-events: none;
}

.tour-callout {
  position: fixed;
  z-index: 102;
  max-width: calc(100vw - 28px);
  padding: var(--space-7);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-3);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: 0 18px 42px rgba(16, 24, 32, 0.3);
  pointer-events: auto;
}

.tour-callout-fallback {
  left: 50%;
  top: 50%;
  width: min(420px, calc(100vw - 28px));
  transform: translate(-50%, -50%);
}

.tour-progress {
  margin-bottom: var(--space-3);
  color: var(--color-teal);
  font-size: var(--text-sm);
  font-weight: 700;
}

.tour-callout h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xl);
  line-height: var(--line-tight);
}

.tour-callout p {
  margin: 0 0 var(--space-6);
  color: var(--color-text-muted);
  line-height: var(--line-normal);
}

.tour-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: var(--space-6);
}
```

Add inside the existing `@media (max-width: 560px)` block:

```css
  .settings-popover {
    left: 0;
    right: auto;
  }

  .tour-callout,
  .tour-callout-mobile,
  .tour-callout-fallback {
    left: var(--space-4);
    right: var(--space-4);
    top: auto;
    bottom: var(--space-4);
    width: auto;
    max-height: min(70vh, 420px);
    overflow: auto;
    transform: none;
  }

  .tour-actions {
    align-items: stretch;
    flex-direction: column;
  }
```

- [ ] **Step 5: Run component tests**

Run:

```bash
pnpm test -- src/components/__tests__/GuidedTour.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/GuidedTour.tsx src/components/__tests__/GuidedTour.test.tsx src/styles.css
git commit -m "Add guided tour overlay component"
```

## Task 4: App Integration And Settings Replay

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/components/FileDrop.tsx`
- Modify: `src/components/Overview.tsx`
- Modify: `src/components/WorkspaceStatus.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add stable tour targets**

Apply these targeted attribute additions:

```tsx
// src/components/FileDrop.tsx
<section
  data-tour="file-drop"
  className={dragging ? "dropzone dragging" : "dropzone"}
  ...
>
```

```tsx
// src/components/Overview.tsx
<div className="panel" data-tour="overview-panel">
```

```tsx
// src/components/WorkspaceStatus.tsx
<Panel title={t("workspace.title")} className="workspace-status-panel">
```

Then wrap the rendered `WorkspaceStatus` in `App.tsx`:

```tsx
<div data-tour="workspace-status">
  <WorkspaceStatus ... />
</div>
```

- [ ] **Step 2: Integrate tour state into App**

In `src/app/App.tsx`, add imports:

```tsx
import { HelpCircle, Download, FileUp, Gauge, Settings, TestTube2 } from "lucide-react";
import { buildTourSteps, nextAvailableTourStepIndex } from "./tourSteps";
import { GuidedTour } from "../components/GuidedTour";
import {
  completedOnboardingTourState,
  loadOnboardingTourState,
  saveOnboardingTourState,
  skippedOnboardingTourState,
} from "../domain/settings";
```

Add state inside `App`:

```tsx
  const [tourState, setTourState] = useState(() => loadOnboardingTourState());
  const [tourActive, setTourActive] = useState(() => loadOnboardingTourState().status === "new");
  const [tourIndex, setTourIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
```

Replace this with a single lazy initializer to avoid double load:

```tsx
  const [initialTourState] = useState(() => loadOnboardingTourState());
  const [tourState, setTourState] = useState(initialTourState);
  const [tourActive, setTourActive] = useState(initialTourState.status === "new");
```

Add derived steps:

```tsx
  const tourSteps = useMemo(() => buildTourSteps(Boolean(activeFile)), [activeFile]);
```

Add handlers:

```tsx
  function setTourStep(index: number) {
    const nextIndex = nextAvailableTourStepIndex(tourSteps, index, Boolean(activeFile));
    const nextStep = tourSteps[nextIndex];
    if (nextStep?.requiredTab) {
      setActiveTab(nextStep.requiredTab);
    }
    setTourIndex(nextIndex);
  }

  function skipTour() {
    const nextState = skippedOnboardingTourState();
    saveOnboardingTourState(nextState);
    setTourState(nextState);
    setTourActive(false);
  }

  function completeTour() {
    const nextState = completedOnboardingTourState();
    saveOnboardingTourState(nextState);
    setTourState(nextState);
    setTourActive(false);
  }

  function restartTour() {
    setSettingsOpen(false);
    setTourIndex(0);
    setTourActive(true);
  }
```

After `loadSample()` sets file state, allow tour to advance naturally by leaving `tourActive` unchanged. When the user clicks the tour sample action, call `loadSample()` then `setTourStep(2)`.

- [ ] **Step 3: Add Settings menu and tour mount**

In the topbar actions, add `data-tour` and Settings:

```tsx
        <div className="topbar-actions" data-tour="topbar-file-actions">
          ...
          <div className="settings-menu-wrap">
            <button
              type="button"
              className="button ghost"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings size={16} aria-hidden />
              {t("settings.menu")}
            </button>
            {settingsOpen ? (
              <div className="settings-popover" role="menu">
                <button type="button" className="button ghost" role="menuitem" onClick={restartTour}>
                  <HelpCircle size={16} aria-hidden />
                  {t("settings.restartGuide")}
                </button>
              </div>
            ) : null}
          </div>
```

Add `data-tour="privacy-note"` to the first privacy note:

```tsx
        <div className="privacy-note" data-tour="privacy-note">
```

Add `data-tour="file-rail"` to the file rail `aside`, and `data-tour="analysis-tabs"` around `Tabs`.

Before closing `.app-shell`, mount:

```tsx
      {tourActive ? (
        <GuidedTour
          steps={tourSteps}
          activeIndex={tourIndex}
          onIndexChange={setTourStep}
          onSkip={skipTour}
          onDone={completeTour}
          onLoadSample={() => {
            loadSample();
            setTourStep(2);
          }}
        />
      ) : null}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If `tourState` is unused, remove the state variable and keep only active/index state; persistence is done through handlers.

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/components/FileDrop.tsx src/components/Overview.tsx src/components/WorkspaceStatus.tsx src/styles.css
git commit -m "Integrate guided tour into app shell"
```

## Task 5: E2E Coverage And Existing Test Compatibility

**Files:**
- Modify: `tests/analyzer.spec.ts`

- [ ] **Step 1: Add storage key constant and helper**

At the top of `tests/analyzer.spec.ts`, add:

```ts
const onboardingTourStorageKey = "openvta.onboardingTour.v1";

async function markTourCompleted(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ status: "completed", completedAt: 1700000000000, version: 1 }),
    );
  }, onboardingTourStorageKey);
}
```

- [ ] **Step 2: Seed existing workflow tests**

Before `page.goto("/")` in existing analyzer workflow tests, call:

```ts
await markTourCompleted(page);
```

Apply this to existing tests that are not specifically testing the tour.

- [ ] **Step 3: Add dedicated tour tests**

Add these tests near the language test:

```ts
test("guided tour can be skipped and replayed from settings", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "Analyze VTA files locally" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Restart guide" }).click();
  await expect(page.getByRole("dialog", { name: "Analyze VTA files locally" })).toBeVisible();
});

test("guided tour loads sample and completes without reappearing", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Load sample for tour" }).click();
  await expect(page.getByRole("heading", { name: "OpenVTA_sample.Vta" })).toBeVisible();

  for (let index = 0; index < 6; index += 1) {
    await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("guided tour supports Korean and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByLabel("Language").selectOption("ko");
  await expect(page.getByRole("dialog", { name: "VTA 파일을 브라우저에서 분석" })).toBeVisible();
  await expect(page.getByRole("button", { name: "건너뛰기" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
```

- [ ] **Step 4: Run E2E tests**

Run:

```bash
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/analyzer.spec.ts
git commit -m "Cover guided tour browser flows"
```

## Task 6: Full Verification And Polish

**Files:**
- Modify as needed only for test failures directly related to this feature.

- [ ] **Step 1: Run full unit and type checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS and `dist/` generated.

- [ ] **Step 3: Run full E2E**

Run:

```bash
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 4: Manual responsive visual check**

Run:

```bash
pnpm dev
```

Open the local URL printed by Vite. Check:

- First-run tour appears.
- Skip hides it.
- Settings -> Restart guide opens it.
- Load sample for tour loads the sample and advances.
- Korean language changes the tour text.
- Mobile width does not overflow.

- [ ] **Step 5: Commit final polish if any**

If Step 4 required code changes:

```bash
git add src tests
git commit -m "Polish guided tour experience"
```

If no changes were required, do not create an empty commit.

## Self-Review

Spec coverage:

- First-run auto-run: Task 4 and Task 5.
- Skip/done persistence: Task 1, Task 3, Task 4, Task 5.
- Settings replay: Task 4 and Task 5.
- Desktop anchored overlay and mobile bottom sheet: Task 3.
- Multilingual tour: Task 2 and Task 5.
- Accessibility and keyboard: Task 3 tests and implementation.
- No backend/cost changes: no task adds server infrastructure.

Placeholder scan:

- No `TBD`, `TODO`, `implement later`, or undefined future requirements are present.

Type consistency:

- `OnboardingTourState`, `TourStep`, `TourStepId`, `buildTourSteps`, and `GuidedTour` props are defined before use.
- Storage key name is consistent: `openvta.onboardingTour.v1`.
