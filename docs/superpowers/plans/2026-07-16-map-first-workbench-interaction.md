# Map-first Lap Workbench Interaction Implementation Plan

**Goal:** Make the workbench map-first and full-width, add editable per-lap map
layers, fix continuous chart cursor tracking, and remove the opportunity widget
and redundant telemetry controls.

**Architecture:** A pure lap-style builder owns deterministic presentation
defaults while the workbench keeps recording-session overrides. RouteMap maps
style classes to supported MapLibre layers. ChartPanel emits plot-domain pointer
movement from ZRender and the existing workbench cursor remains the single map/
chart synchronization contract.

**Tech stack:** React 18, TypeScript, ECharts 5, MapLibre 4, React Grid Layout,
Vitest, Testing Library, Vite, Aside, GitHub Pages.

## Task 1: Lock the new layout and removed surface in tests

**Files:**

- Modify `src/domain/__tests__/segmentWorkbenchPreferences.test.ts`
- Modify `src/components/__tests__/SegmentDashboard.test.tsx`
- Modify `src/components/__tests__/SegmentAnalysisWorkbench.test.tsx`

- [ ] Assert preferences use a v2 key and contain no `opportunities` widget.
- [ ] Assert desktop/tablet map and telemetry each occupy full width, map first.
- [ ] Assert the workbench has no Time-loss ranking control or region.
- [ ] Run the focused tests and confirm the old implementation fails.

## Task 2: Remove opportunity ranking end-to-end

**Files:**

- Modify `src/domain/types.ts`
- Modify `src/domain/segmentWorkbenchPreferences.ts`
- Modify `src/app/useSegmentWorkbench.ts`
- Modify `src/components/SegmentAnalysisWorkbench.tsx`
- Delete `src/domain/sectionOpportunities.ts`
- Delete `src/domain/__tests__/sectionOpportunities.test.ts`
- Delete `src/components/SegmentOpportunityRanking.tsx`
- Delete `src/components/__tests__/SegmentOpportunityRanking.test.tsx`

- [ ] Remove widget, state, calculations, rendering, and dedicated types/tests.
- [ ] Update workbench controls and preference normalization implicitly through
      the reduced widget ID list.
- [ ] Run `rg` to prove no production opportunity import remains.

## Task 3: Add deterministic editable map layers

**Files:**

- Create `src/domain/lapMapLayers.ts`
- Create `src/domain/__tests__/lapMapLayers.test.ts`
- Create `src/components/SegmentLapLayerControls.tsx`
- Create `src/components/__tests__/SegmentLapLayerControls.test.tsx`
- Modify `src/components/SegmentTrajectoryMap.tsx`
- Modify `src/components/__tests__/SegmentTrajectoryMap.test.tsx`
- Modify `src/components/RouteMap.tsx`
- Modify `src/components/__tests__/RouteMapSources.test.tsx`
- Modify `src/i18n/lapLocales.ts`
- Modify `src/styles.css`

- [ ] Write failing pure tests for focused/reference/other automatic styles and
      override/reset behavior.
- [ ] Write failing component tests for visibility, color, style, opacity, show
      comparison, show all, and auto reset.
- [ ] Build all eligible lap overlays, hide non-role laps by default, and stop
      supplying colored section/heat geometry in the comparison map.
- [ ] Render solid/dashed/dotted MapLibre filtered layers and SVG dash arrays.
- [ ] Add accessible localized layer controls and compact legend styling.
- [ ] Run focused domain/component tests.

## Task 4: Fix continuous pointer tracking

**Files:**

- Modify `src/components/ChartPanel.tsx`
- Modify `src/components/__tests__/ChartPanelComponent.test.tsx`
- Modify `src/components/SegmentTelemetryChart.tsx`
- Modify `src/components/__tests__/SegmentTelemetryChart.test.tsx`

- [ ] Add a failing test that invokes a ZRender mousemove in the grid and expects
      a converted domain callback without a series event.
- [ ] Add `onHoverDomain`, use `containPixel`/`convertFromPixel`, RAF throttle,
      and immediately render the cursor.
- [ ] Resolve hover domain to the nearest focused trajectory source point.
- [ ] Remove the series `mouseover` dependency and verify cleanup.

## Task 5: Simplify telemetry and enlarge the workbench

**Files:**

- Modify `src/components/SegmentTelemetryChart.tsx`
- Modify `src/components/SegmentAnalysisWorkbench.tsx`
- Modify `src/domain/segmentWorkbenchPreferences.ts`
- Modify `src/i18n/lapLocales.ts`
- Modify `src/styles.css`
- Modify affected component tests

- [ ] Keep only speed, measured acceleration, and Delta-T metrics.
- [ ] Remove range/zoom/detailed/reset buttons and keyboard range form.
- [ ] Change title copy to Lap telemetry.
- [ ] Use the full browser width for the workbench and viewport-aware minimum
      map/chart heights.
- [ ] Store new default layout under v2 so old six-column placement cannot win.

## Task 6: Verify, deploy, and prove production behavior

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm test:e2e` without installing or launching a separate browser.
- [ ] Start the existing Vite server only if needed and use Aside with the
      supplied local VTA for visual and interaction QA.
- [ ] Commit intentionally on `main`, push `origin/main`, and monitor GitHub
      Pages deployment to success.
- [ ] Reload the deployed URL in Aside and repeat map layer and cursor smoke
      checks.

