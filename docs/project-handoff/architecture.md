# Architecture

Last updated: 2026-07-08

## 기술 스택

- UI: React 18 + TypeScript.
- Build: Vite.
- Unit/component test: Vitest + Testing Library.
- E2E: Playwright.
- Map: MapLibre GL with coordinate fallback.
- Chart: ECharts.
- ZIP import: JSZip.
- Icons: lucide-react.
- Deploy target: static GitHub Pages.

## 디렉토리 구조

- `src/main.tsx`: React entrypoint.
- `src/app/App.tsx`: app-level state orchestration.
- `src/app/sampleData.ts`: built-in sample VTA/CAL data.
- `src/app/tourSteps.ts`: guided tour step model and selectors.
- `src/components/`: UI components.
- `src/domain/`: parsing, analysis, calibration, filtering, export, settings, statistics.
- `src/i18n/`: local translation system.
- `src/test/setup.ts`: test environment setup.
- `tests/analyzer.spec.ts`: browser workflow coverage.
- `.github/workflows/`: CI and GitHub Pages deployment.
- `docs/superpowers/`: feature specs and implementation plans.
- `docs/project-handoff/`: current handoff documentation.

OpenVTA Live integration note: private `openvta-live` may source-sync or embed
analyzer behavior for authenticated user/admin routes, but this repository
should remain deployable as a standalone static GitHub Pages app with no backend
runtime dependency.

## App 상태 흐름

`App.tsx`가 현재는 주요 상태의 중심입니다.

주요 상태:

- `files`: loaded workspace files.
- `activeIndex`: active file index.
- `selectedPointIndex`: selected route point.
- `activeTab`: overview/charts/tables/calibration/export.
- `calibration`: current calibration offsets.
- `filterSettings`: low-pass filter settings.
- `sourceVisibility`: raw GPS/enhanced GPS visibility.
- `mapSettings`: point size, tile URL, speed thresholds.
- `activeSegment`: start/end/source segment selection.
- `region`: axis-aligned region selection.
- `transformMode`: raw/calibrated/filtered/compare.
- `lineEnding`: LF/CRLF export setting.
- `tourActive`, `tourIndex`: guided tour state.
- `settingsOpen`: Settings menu state.

계산 흐름:

1. `loadTextFilesFromInput()`이 `.Vta` 또는 `.zip` 파일을 text file 배열로 변환합니다.
2. `parseVtaText()`가 각 파일을 `VtaFile`로 파싱합니다.
3. `toWorkspaceFile()`이 id/loadedAt을 붙여 workspace file로 저장합니다.
4. `displayGpsPointsWithSources()`가 source toggle을 반영한 visible GPS points를 만듭니다.
5. `applyCalibration()`과 `applyAccelerationFilter()`가 sensor transform 결과를 만듭니다.
6. `sensorsForTransformMode()`가 chart/export에 사용할 sensor set을 결정합니다.
7. Overview/Charts/Tables/Calibration/Export가 같은 app-level state를 공유합니다.

## Domain 모듈

`src/domain/types.ts`

- `VtaFile`, `GpsPoint`, `SensorPoint`, `ParseWarning` 등 핵심 타입을 정의합니다.
- format은 `modern-openvta`, `legacy-phone`, `legacy-imu-box`, `unknown`입니다.
- transform mode는 `raw`, `calibrated`, `filtered`, `compare`입니다.

`src/domain/parser.ts`

- `.Vta` text를 headers, raw lines, GPS points, enhanced points, sensor points, warnings로 파싱합니다.
- modern OpenVTA, legacy phone, standalone IMU box 형태를 감지합니다.
- 이상한 좌표, 짧은 row, low satellite 등 warning을 생성합니다.

`src/domain/zip.ts`

- `.zip` 파일이면 JSZip으로 내부 `.Vta` entries를 읽습니다.
- 일반 `.Vta` 파일이면 그대로 text로 읽습니다.

`src/domain/analysis.ts`

- source visibility filtering.
- segment normalization/summary.
- route distance series.
- velocity-derived acceleration validation rows.
- axis-aligned region summary.

`src/domain/statistics.ts`

- file-level summary stats.
- route distance calculation.
- duration estimation.

`src/domain/calibration.ts`

- sensor rows에서 calibration offset을 추정합니다.
- full session, static window, CAL file, manual offset 흐름에서 사용됩니다.
- 원본 data는 immutable로 두고 transformed sensors를 별도로 만듭니다.

`src/domain/filtering.ts`

- acceleration channel에 low-pass filter를 적용합니다.
- timestamp가 irregular하면 effective sample rate warning을 반환합니다.

`src/domain/export.ts`

- original segment VTA.
- transformed segment VTA with provenance metadata.
- GPS CSV, sensor CSV, validation CSV, warning CSV, summary CSV/JSON.
- LF/CRLF line ending conversion.

`src/domain/settings.ts`

- optional localStorage persistence helper.
- storage 접근이 막혀도 앱이 죽지 않도록 no-op fallback을 사용합니다.

## Local Storage Keys

- `openvta.language.v1`: selected UI language.
- `openvta.calibrationPresets.v1`: named calibration presets.
- `openvta.onboardingTour.v1`: guided onboarding tour status.

저장소 접근은 optional입니다. private mode, restricted iframe, blocked storage 환경에서도 기본 기능이 동작해야 합니다.

## Component 책임

- `FileDrop`: empty state, file drop, file picker, sample load.
- `FileTray`: loaded file list, active file, remove controls.
- `Overview`: map, summary, selected point, segment, region, warnings.
- `RouteMap`: MapLibre map + coordinate fallback.
- `MapControls`: route fit, segment start/end, region creation, clear segment, point-size control.
- `Charts`: chart tabs and linked chart interactions.
- `Tables`: sortable/filterable/exportable analysis tables.
- `CalibrationPanel`: offsets, CAL load, static window, presets, filter, transform mode.
- `ExportPanel`: segment controls and download actions.
- `WorkspaceStatus`: source toggles and compact analysis state.
- `GuidedTour`: modal overlay, target highlight, focus management, responsive callout.
- `ui.tsx`: small shared controls such as tabs and file picker button.

## Guided Tour 구조

`src/app/tourSteps.ts`는 stable selector 기반 step metadata를 반환합니다.

현재 target selector:

- `[data-tour='privacy-note']`
- `[data-tour='file-drop']`
- `[data-tour='topbar-file-actions']`
- `[data-tour='file-rail']`
- `[data-tour='overview-panel']`
- `[data-tour='workspace-status']`
- `[data-tour='analysis-tabs']`

`GuidedTour.tsx`는 step의 `target`, `requiredTab`, `requiresFile`, `sampleAction`을 사용합니다. tour는 parsed data를 직접 변경하지 않고, sample load나 tab change 같은 UI action만 App callback으로 요청합니다.

## I18n 구조

의존성 없이 local i18n layer를 사용합니다.

- `src/i18n/locales.ts`: language list, dictionaries, language detection helpers.
- `src/i18n/I18nProvider.tsx`: selected language state, persistence, `<html lang>`.
- `src/i18n/useI18n.ts`: `t()`, `language`, `setLanguage`, `languages`.
- `src/i18n/messages.ts`: localized domain message formatting.
- `src/i18n/parseWarnings.ts`, `filterWarnings.ts`: warning message localization boundary.

English dictionary가 baseline입니다. 다른 언어 dictionary는 TypeScript shape로 completeness를 맞춰야 합니다. 새로운 UI text를 추가하면 모든 언어 key를 같이 추가해야 합니다.

## 테스트 구조

Unit/domain:

- parser, analysis, calibration, filtering, settings.

Component:

- CalibrationPanel, Charts, GuidedTour, Tables, shared UI.

I18n:

- dictionary completeness.
- language detection/fallback/persistence.
- warning/message localization.

E2E:

- full sample workflow.
- Korean persistence and mobile overflow.
- guided tour skip/replay.
- guided tour sample load and completion.
- Korean/mobile tour layout.

기존 E2E는 onboarding tour가 방해하지 않도록 `openvta.onboardingTour.v1`을 completed로 seed합니다. Tour 자체는 별도 E2E에서 검증합니다.
