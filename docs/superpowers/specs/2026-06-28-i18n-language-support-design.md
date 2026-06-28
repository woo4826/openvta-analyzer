# OpenVTA Analyzer I18n Language Support Design

## Goal

Add production-quality multilingual UI support to OpenVTA Analyzer while keeping the zero-backend GitHub Pages deployment model. English and Korean are first-class languages. Japanese, Simplified Chinese, Spanish, French, and German are included as useful secondary translations.

## Scope

Included:

- App-level language selector in the top bar.
- Locale persistence in browser local storage under `openvta.language.v1`.
- Browser-language detection on first load, with fallback to English.
- Localized UI chrome, tabs, panels, buttons, field labels, empty states, status text, chart titles, chart legends, map controls, calibration/export controls, and user-facing load/filter/calibration messages.
- Tests that prove language selection persists and Korean UI renders in the core workflow.
- README documentation for language support and translation quality tiers.

Not localized:

- Parsed VTA file contents, source file names, enum-like source names in imported data, generated CSV headers, generated JSON property names, and transformed `.Vta` metadata headers. These stay stable in English for compatibility with downstream tools and tests.
- Low-level parse warning text produced from file parsing. These may contain data-format-specific wording and remain English in this phase.

## Languages

- `en`: English, default and source of truth.
- `ko`: Korean, first-class translation with domain-specific wording.
- `ja`: Japanese, secondary quality.
- `zh-CN`: Simplified Chinese, secondary quality.
- `es`: Spanish, secondary quality.
- `fr`: French, secondary quality.
- `de`: German, secondary quality.

## Architecture

Create a small local i18n layer instead of adding a dependency:

- `src/i18n/locales.ts` owns the language list and translation dictionaries.
- `src/i18n/I18nProvider.tsx` owns selected language state, browser detection, persistence, and context.
- `src/i18n/useI18n.ts` exposes `useI18n()` with `t(key, values?)`, `language`, `setLanguage`, and `languages`.

The translation keys are dot-separated strings. The English dictionary is the complete baseline. Other dictionaries must satisfy the same TypeScript shape so missing translations fail typecheck.

Interpolation supports simple string/number placeholders such as `{count}` and `{name}`. Pluralization is intentionally not added in this phase because current UI counts can be expressed with numeric labels or simple status text.

## UX

The selector appears in the top bar near file/sample controls. It uses a compact native `select` with a stable label, for example:

- English: `Language`
- Korean: `언어`

The selector should not dominate the operational interface. Labels must remain short enough for mobile. The selected language should take effect immediately without reloading.

## Implementation Notes

- Keep units (`km`, `km/h`, `m`, `Hz`, `g`, `m/s^2`) unchanged.
- Keep the product name `OpenVTA Analyzer` unchanged.
- Keep file format names (`modern-openvta`, `.Vta`, `.zip`, `CAL`) unchanged.
- Components should receive translated labels through props or call `useI18n()` locally. For broad components with many labels, local hook usage is acceptable.
- ECharts series names and chart titles should use localized labels, while numeric axis unit names stay unchanged.

## Error Handling

- Invalid stored locale falls back to browser locale or English.
- Unsupported browser locale falls back to English.
- Missing interpolation values render as an empty string rather than exposing `{key}` artifacts to users.

## Testing

Add unit tests for:

- Locale fallback and persistence helpers.
- Translation interpolation.

Add E2E coverage for:

- Loading the app, switching to Korean, verifying top-level Korean UI.
- Reloading and verifying Korean preference persists.
- Loading sample and verifying key Korean labels in Overview/Calibration/Export.

Existing English E2E should continue passing.

## Deployment

No backend or new secrets are required. The existing GitHub Pages workflow remains valid. Final verification must include:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
- Browser visual check for English and Korean at desktop/mobile widths.
