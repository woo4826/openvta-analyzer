# Guided Onboarding Tour Design

## Goal

Add a guided onboarding overlay to OpenVTA Analyzer so first-time users can learn the current web analyzer by using the real interface. The tour must be skippable, must not appear again after skip or completion, and must be replayable from Settings. It must work on desktop and mobile and support the existing multilingual UI model, with English and Korean as primary-quality languages.

## Scope

Included:

- First-run guided tour that opens automatically when no saved tour state exists.
- Skip and Done actions that persist the tour as no longer auto-shown.
- Settings entry in the top bar with a Restart guide action.
- Step-by-step overlay using stable targets in the existing analyzer UI.
- Desktop anchored callouts with target highlighting.
- Mobile bottom-sheet callouts that avoid overflow and fragile positioning.
- English, Korean, Japanese, Simplified Chinese, Spanish, French, and German tour strings.
- Unit and E2E coverage for persistence, replay, localization, and mobile usability.

Not included:

- A separate documentation site or landing page.
- A full help center, searchable manual, or video/tutorial content.
- Forced downloads or destructive actions during the tour.
- General CAD-style training beyond the current web analyzer workflows.

## UX Direction

Use the anchored overlay tour shown in the approved mockup.

Desktop behavior:

- Dim the page with a subtle overlay.
- Highlight the current target with a visible ring.
- Place a compact callout near the target when there is room.
- Fall back to a centered or bottom callout if the target is missing or too close to an edge.

Mobile behavior:

- Scroll the target into view when possible.
- Use a bottom-sheet callout with stable width and safe spacing.
- Do not depend on exact target coordinates.
- Keep buttons reachable and prevent horizontal overflow.

The tour controls are:

- Back
- Next
- Skip
- Done on the final step
- Escape closes and persists as skipped

Skip and Done both prevent automatic re-display. Restart guide from Settings reopens the tour intentionally without clearing the user's language or analysis data.

## Tour Flow

The tour uses roughly eight steps:

1. Welcome and privacy: explain that files are parsed locally in the browser.
2. Open data: point to Choose files / Open VTA/ZIP and Load sample.
3. File workspace: explain active file, detected format, and row counts.
4. Overview: explain the map, route summary, selected point, and warnings.
5. Workspace inspector: explain source toggles and transform mode.
6. Charts: switch to Charts and explain chart inspection and segment support.
7. Calibration: switch to Calibration and explain CAL files, estimates, filters, and transform preview.
8. Export: switch to Export and explain original/transformed VTA, CSV, validation, and summary downloads.

When the app starts with no loaded file, the tour begins on the empty file drop screen. If a step requires loaded data, the tour can offer a safe Load sample action or continue after the user loads data. The built-in sample is preferred for guided learning because it avoids requiring the user to provide a file.

## Architecture

Create a focused tour layer instead of scattering tour logic through existing components.

New or changed areas:

- `src/app/App.tsx`: owns tour state, active tab coordination, Settings trigger, and tour component mounting.
- `src/components/GuidedTour.tsx`: renders overlay, highlight, callout, controls, keyboard handling, and responsive positioning.
- `src/app/tourSteps.ts`: defines tour step metadata, target selectors, required tab, and optional action hints.
- `src/domain/settings.ts`: adds versioned onboarding-tour persistence helpers.
- `src/i18n/locales.ts`: adds `tour.*` and `settings.*` translation keys.
- `src/styles.css`: adds overlay, highlight, callout, bottom-sheet, and Settings popover styles using existing CSS tokens.

The tour should not mutate parsed VTA data. It may change UI-only state such as the active analysis tab as the user moves through steps.

## State And Persistence

Use a versioned local storage key:

- `openvta.onboardingTour.v1`

Persisted shape:

```ts
interface OnboardingTourState {
  status: "new" | "skipped" | "completed";
  completedAt?: number;
  skippedAt?: number;
  version: 1;
}
```

Implementation details:

- Missing storage means first run.
- Invalid JSON or invalid shape falls back to first run.
- Storage access must go through the existing recoverable settings helper pattern.
- Blocked localStorage must not break the app.

## Settings Entry

Add a compact Settings control to the top bar using the existing `Settings` icon and button styling. It should open a small menu/popover with:

- Restart guide

The current language selector remains visible in the top bar. The Settings control is the stable place for future global preferences, but this phase only adds tour replay.

## Localization

Add tour and settings strings to the existing local i18n system:

- `en`: primary source text.
- `ko`: primary-quality Korean.
- `ja`, `zh-CN`, `es`, `fr`, `de`: secondary-quality but complete translations.

Generated exports, parsed file contents, units, and file format names remain unchanged, consistent with the existing i18n boundary.

## Accessibility

Requirements:

- The callout exposes an accessible title and body.
- Controls are keyboard reachable.
- Escape skips/closes the active tour.
- Focus moves into the callout when the tour opens and returns to the prior active element when it closes if possible.
- The highlighted target is not the only way to understand the step.
- Hidden tab panels are never targeted; the app switches to the needed tab before positioning.
- The tour avoids targeting exact map points, chart internals, or fragile SVG/canvas coordinates.

## Error Handling

- If a target selector is missing, render the callout in fallback placement and keep the tour usable.
- If a required file is not loaded, use the empty-state step and guide users to load a sample or their own file.
- If layout measurement fails, use fallback placement.
- If storage is unavailable, allow the tour to work for the current session without crashing.

## Testing

Unit tests:

- Tour storage falls back for missing or invalid state.
- Skip and complete states round-trip through the versioned storage key.
- Blocked storage does not throw.
- Translation dictionaries remain complete.

Component tests:

- Tour renders first step when state is new.
- Skip persists skipped state.
- Done persists completed state.
- Restart guide opens the tour from Settings.

E2E tests:

- First visit shows the English tour.
- Skip then reload does not show the tour again.
- Complete then reload does not show the tour again.
- Settings can restart the guide after skip/completion.
- Korean UI shows Korean tour labels.
- Mobile viewport keeps the callout and buttons within the viewport.
- Existing analyzer workflows still pass with the tour pre-seeded as completed or explicitly dismissed.

Verification gates:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## Deployment

No backend, secrets, paid services, or new deployment infrastructure are needed. The existing public GitHub Pages deployment remains valid. The feature is fully client-side and compatible with the zero-cost public repository requirement.

## Open Decisions

Resolved:

- Use the anchored overlay tour rather than a checklist or separate wizard.
- Put replay under Settings in the top bar.
- Treat Skip and Done as persistent opt-out states.
- Use English and Korean as primary-quality tour languages.

No unresolved product decisions remain for this implementation phase.
