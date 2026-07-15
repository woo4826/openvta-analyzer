# GPS–Sensor Alignment and Lap Workbench Reliability Implementation Plan

> **Execution:** implement test-first, verify with the supplied VTA through
> Aside, request an independent code review, then deploy `main` to GitHub Pages.

**Goal:** Align legacy sensor rows to the focused GPS trajectory using sensor
elapsed time, enforce a strict two-role comparison map, and repair misleading
lap-analysis controls.

**Architecture:** Extend the pure synchronization adapter with inferred
sensor-clock anchors. Separate presentation lap visibility from map comparison
roles. Make RouteMap controls capability-driven, give the comparison map a
focused-lap hit surface, and let ChartPanel reset its internal ECharts view from
a controlled reset token.

**Tech stack:** React 18, TypeScript, ECharts 5, MapLibre, Vitest, Testing
Library, Aside, Vite, GitHub Pages.

---

### Task 1: Lock the GPS–sensor clock contract with domain tests

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/sensorSynchronization.ts`
- Modify: `src/domain/__tests__/sensorSynchronization.test.ts`
- Modify: `src/i18n/lapLocales.ts`

- [x] Add a failing asymmetric-row-density test proving elapsed-time mapping.
- [x] Add tests for unbracketed/non-monotonic anchors and row-order fallback.
- [x] Add `sensor-clock` to `SensorSynchronizationMethod`.
- [x] Infer GPS sensor-clock anchors from bracketing VTA sensor rows.
- [x] Map legacy sensors by `elapsedSeconds` and retain deterministic duplicate
      coalescing.
- [x] Add localized `sensor-clock` status copy.
- [x] Run focused domain and i18n tests.

### Task 2: Enforce focused/reference comparison roles

**Files:**
- Modify: `src/app/useSegmentWorkbench.ts`
- Modify: `src/app/__tests__/useSegmentWorkbench.test.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`
- Modify: `src/components/SegmentTrajectoryMap.tsx`
- Modify: `src/components/__tests__/SegmentTrajectoryMap.test.tsx`

- [x] Replace arbitrary map overlays with focused/reference-derived overlays.
- [x] Keep `visibleLapIds` for chart, table, and variation presentation only.
- [x] Remove the unused overlay-toggle state and API.
- [x] Add role-swap callbacks so focus/reference stay distinct when possible.
- [x] Add regressions for `Visible laps: All`, `focus-only`, and equal-role
      selections.
- [x] Run hook and workbench component tests.

### Task 3: Make comparison-map rendering and interaction unambiguous

**Files:**
- Modify: `src/components/RouteMap.tsx`
- Modify: `src/components/SegmentTrajectoryMap.tsx`
- Modify: `src/components/__tests__/RouteMapSources.test.tsx`
- Modify: `src/components/__tests__/SegmentTrajectoryMap.test.tsx`

- [x] Add optional `showRouteLine` and `interactionPoints` contracts.
- [x] Hide the all-session base line in the comparison map.
- [x] Publish only focused-lap interaction points while preserving original
      source indexes in click callbacks.
- [x] Cover MapLibre and coordinate-fallback behavior.
- [x] Run focused map tests.

### Task 4: Remove inert controls and make Reset complete

**Files:**
- Modify: `src/components/RouteMap.tsx`
- Modify: `src/components/MapControls.tsx`
- Modify: `src/components/LapAnalysis.tsx`
- Modify: `src/components/SegmentAnalysisWorkbench.tsx`
- Modify: `src/components/ChartPanel.tsx`
- Modify: `src/components/SegmentTelemetryChart.tsx`
- Modify: related component tests

- [x] Make segment and region callbacks optional capabilities.
- [x] Hide unsupported region creation in Lap Analysis maps.
- [x] Do not expose Whole-lap scope as a clearable selected segment.
- [x] Add a ChartPanel reset token that clears brush and restores linked zoom.
- [x] Make the telemetry Reset button reset scope and chart state together.
- [x] Add component regressions for every repaired control.

### Task 5: Verify the complete objective

- [x] Run all focused tests changed above.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm lint`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build`.
- [x] Run the relevant browser flows through Aside; do not launch the standalone
      Playwright suite because workspace `AGENTS.md` requires Aside for UI QA.
- [x] Start the local app and use Aside with the supplied VTA.
- [x] Verify sensor-clock status, nonzero samples, strict map overlays, distinct
      roles, map hit behavior, control capabilities, and chart Reset.
- [x] Inspect console/runtime errors.

### Task 6: Review and deploy

- [x] Perform a main-thread requirement-by-requirement review, per the user's
      instruction not to use subagents.
- [x] Address all confirmed correctness or regression findings.
- [x] Re-run the completion verification suite.
- [x] Commit the implementation intentionally and push `main`.
- [x] Confirm the GitHub Pages workflow succeeds.
- [x] Smoke-test the deployed URL through Aside using the supplied VTA.
- [x] Update this plan and the design/handoff documentation with final evidence.

## Final verification and deployment evidence

- Local verification after the final scope-eligibility fix: 54 Vitest files and
  286 tests passed; TypeScript, ESLint, and the production Vite build passed.
- GitHub CI run `29433066406` passed, including all 16 browser tests.
- GitHub Pages run `29433066502` deployed commit `7fb3113` successfully.
- The deployed URL loaded the supplied VTA as 1,589 GPS fixes and 158,289
  sensor rows, matched Inje Speedium, selected focused Lap 7/reference Lap 4,
  and reported `sensor-clock` synchronization with 9,922 samples.
- With presentation visibility set to All, the lap table showed nine
  lap/partial records while the comparison-map legend remained exactly two
  entries. Restoring focused/reference visibility returned the table to two
  rows.
- No browser console or page errors were observed during the deployed smoke
  test.
